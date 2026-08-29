"""Tool definitions and execution.

Every tool validates its inputs before running, returns a typed result rather
than raising into the conversation, and is logged. Tools that depend on a
provider which is not configured return `UNAVAILABLE` -- they never report a
successful send, because the App Flow rule is that a WhatsApp failure must never
be reported as delivered.
"""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crm import Appointment, Customer, Lead
from app.models.enums import AppointmentStatus, LeadStatus, ToolName, ToolStatus
from app.providers.base import ProviderError, WhatsAppProvider
from app.services import business_brain, knowledge
from app.services.datetime_parse import parse_datetime

DEFAULT_APPOINTMENT_MINUTES = 30
PHONE_PATTERN_MIN_DIGITS = 10


@dataclass
class ToolResult:
    """Outcome of one tool call.

    `data` is only populated on success. A caller must never read data from a
    non-success result, which is what keeps a failed lookup from becoming an
    invented answer.
    """

    tool: ToolName
    status: ToolStatus
    data: dict[str, Any] = field(default_factory=dict)
    message: str = ""
    arguments: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0

    @property
    def ok(self) -> bool:
        return self.status is ToolStatus.SUCCESS


@dataclass
class ToolSpec:
    name: ToolName
    description: str
    parameters: dict[str, Any]
    required: tuple[str, ...] = ()

    def as_schema(self) -> dict[str, Any]:
        """OpenAI-style function schema, for providers that support tool calls."""
        return {
            "type": "function",
            "function": {
                "name": self.name.value,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "required": list(self.required),
                },
            },
        }

    def validate(self, arguments: dict[str, Any]) -> str | None:
        """Return an error message when the arguments are unusable."""
        for key in self.required:
            value = arguments.get(key)
            if value is None or (isinstance(value, str) and not value.strip()):
                return f"Missing required argument '{key}'"

        for key, value in arguments.items():
            spec = self.parameters.get(key)
            if spec is None or value is None:
                continue

            expected = spec.get("type")
            if expected == "integer" and not isinstance(value, int):
                return f"Argument '{key}' must be an integer"
            if expected == "string" and not isinstance(value, str):
                return f"Argument '{key}' must be a string"
            if expected == "number" and not isinstance(value, int | float | str | Decimal):
                return f"Argument '{key}' must be a number"

        return None


TOOL_SPECS: dict[ToolName, ToolSpec] = {
    ToolName.FIND_PRODUCT: ToolSpec(
        name=ToolName.FIND_PRODUCT,
        description="Look up a product and its current price by exact catalogue name.",
        parameters={
            "product_name": {"type": "string", "description": "Exact catalogue name"},
            "variant": {"type": "string", "description": "Exact variant name"},
        },
        required=("product_name",),
    ),
    ToolName.CHECK_INVENTORY: ToolSpec(
        name=ToolName.CHECK_INVENTORY,
        description="Check current stock for a product variant.",
        parameters={
            "product_name": {"type": "string"},
            "variant": {"type": "string"},
        },
        required=("product_name",),
    ),
    ToolName.SEARCH_KNOWLEDGE: ToolSpec(
        name=ToolName.SEARCH_KNOWLEDGE,
        description="Search business documents, FAQs, and policies.",
        parameters={"query": {"type": "string"}},
        required=("query",),
    ),
    ToolName.CHECK_AVAILABILITY: ToolSpec(
        name=ToolName.CHECK_AVAILABILITY,
        description="Check whether an appointment slot is free.",
        parameters={
            "when": {"type": "string", "description": "Spoken date and time"},
            "duration_minutes": {"type": "integer"},
        },
        required=("when",),
    ),
    ToolName.BOOK_APPOINTMENT: ToolSpec(
        name=ToolName.BOOK_APPOINTMENT,
        description="Book an appointment for the caller.",
        parameters={
            "when": {"type": "string"},
            "phone": {"type": "string"},
            "name": {"type": "string"},
            "duration_minutes": {"type": "integer"},
            "notes": {"type": "string"},
        },
        required=("when", "phone"),
    ),
    ToolName.CREATE_LEAD: ToolSpec(
        name=ToolName.CREATE_LEAD,
        description="Record the caller as a lead.",
        parameters={
            "phone": {"type": "string"},
            "name": {"type": "string"},
            "requirement": {"type": "string"},
            "budget": {"type": "number"},
            "location": {"type": "string"},
        },
        required=("phone",),
    ),
    ToolName.UPDATE_CRM: ToolSpec(
        name=ToolName.UPDATE_CRM,
        description="Update an existing lead with new information.",
        parameters={
            "lead_id": {"type": "string"},
            "status": {"type": "string"},
            "summary": {"type": "string"},
        },
        required=("lead_id",),
    ),
    ToolName.SEND_WHATSAPP: ToolSpec(
        name=ToolName.SEND_WHATSAPP,
        description="Send the caller a WhatsApp message with current information.",
        parameters={"phone": {"type": "string"}, "message": {"type": "string"}},
        required=("phone", "message"),
    ),
    ToolName.SEND_BROCHURE: ToolSpec(
        name=ToolName.SEND_BROCHURE,
        description="Send a product brochure over WhatsApp.",
        parameters={"phone": {"type": "string"}, "product_name": {"type": "string"}},
        required=("phone", "product_name"),
    ),
    ToolName.SEND_LOCATION: ToolSpec(
        name=ToolName.SEND_LOCATION,
        description="Send the store location over WhatsApp.",
        parameters={"phone": {"type": "string"}},
        required=("phone",),
    ),
    ToolName.TRANSFER_TO_HUMAN: ToolSpec(
        name=ToolName.TRANSFER_TO_HUMAN,
        description="Hand the call to a human team member.",
        parameters={"reason": {"type": "string"}},
    ),
}


def tool_schemas() -> list[dict[str, Any]]:
    return [spec.as_schema() for spec in TOOL_SPECS.values()]


def _normalize_phone(raw: str) -> str | None:
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) < PHONE_PATTERN_MIN_DIGITS:
        return None
    return digits[-12:] if digits.startswith("91") else digits[-10:]


async def _get_or_create_customer(
    db: AsyncSession, business_id: uuid.UUID, phone: str, name: str | None = None
) -> Customer:
    result = await db.execute(
        select(Customer).where(Customer.business_id == business_id, Customer.phone == phone)
    )
    customer = result.scalars().first()

    if customer is None:
        customer = Customer(business_id=business_id, phone=phone, name=name)
        db.add(customer)
        await db.flush()
    elif name and not customer.name:
        customer.name = name

    return customer


class ToolExecutor:
    """Runs tools against the Business Brain and records every call."""

    def __init__(
        self,
        db: AsyncSession,
        business_id: uuid.UUID,
        embedder=None,
        whatsapp: WhatsAppProvider | None = None,
        timezone: str = "Asia/Kolkata",
        now: datetime | None = None,
    ) -> None:
        self.db = db
        self.business_id = business_id
        self.embedder = embedder
        self.whatsapp = whatsapp
        self.timezone = timezone
        self.now = now
        self.call_log: list[ToolResult] = []

    async def run(self, name: ToolName, arguments: dict[str, Any] | None = None) -> ToolResult:
        arguments = dict(arguments or {})
        spec = TOOL_SPECS.get(name)

        if spec is None:
            return self._record(
                ToolResult(
                    tool=name,
                    status=ToolStatus.FAILED,
                    message=f"Unknown tool '{name}'",
                    arguments=arguments,
                )
            )

        error = spec.validate(arguments)
        if error:
            return self._record(
                ToolResult(
                    tool=name,
                    status=ToolStatus.INVALID_INPUT,
                    message=error,
                    arguments=arguments,
                )
            )

        handler = self._handlers().get(name)
        if handler is None:
            return self._record(
                ToolResult(
                    tool=name,
                    status=ToolStatus.UNAVAILABLE,
                    message=f"Tool '{name}' is not implemented yet",
                    arguments=arguments,
                )
            )

        started = datetime.now(UTC)
        try:
            result = await handler(arguments)
        except ProviderError as exc:
            result = ToolResult(tool=name, status=ToolStatus.UNAVAILABLE, message=exc.message)
        except Exception as exc:  # noqa: BLE001 - a tool must not break the call
            result = ToolResult(tool=name, status=ToolStatus.FAILED, message=str(exc))

        result.arguments = arguments
        result.duration_ms = int((datetime.now(UTC) - started).total_seconds() * 1000)
        return self._record(result)

    def _record(self, result: ToolResult) -> ToolResult:
        self.call_log.append(result)
        return result

    def _handlers(self) -> dict[ToolName, Callable[[dict[str, Any]], Awaitable[ToolResult]]]:
        return {
            ToolName.FIND_PRODUCT: self._find_product,
            ToolName.CHECK_INVENTORY: self._check_inventory,
            ToolName.SEARCH_KNOWLEDGE: self._search_knowledge,
            ToolName.CHECK_AVAILABILITY: self._check_availability,
            ToolName.BOOK_APPOINTMENT: self._book_appointment,
            ToolName.CREATE_LEAD: self._create_lead,
            ToolName.UPDATE_CRM: self._update_crm,
            ToolName.SEND_WHATSAPP: self._send_whatsapp,
            ToolName.SEND_BROCHURE: self._send_brochure,
            ToolName.SEND_LOCATION: self._send_location,
            ToolName.TRANSFER_TO_HUMAN: self._transfer_to_human,
        }

    async def _find_product(self, args: dict[str, Any]) -> ToolResult:
        result = await business_brain.find_product(
            self.db,
            self.business_id,
            args["product_name"],
            args.get("variant"),
            at=self.now,
        )

        if not result.found or result.product is None:
            return ToolResult(
                tool=ToolName.FIND_PRODUCT,
                status=ToolStatus.NOT_FOUND,
                message=result.reason or "product_not_found",
                data={"suggestions": result.suggestions},
            )

        return ToolResult(
            tool=ToolName.FIND_PRODUCT,
            status=ToolStatus.SUCCESS,
            data={
                "product_name": result.product.name,
                "brand": result.product.brand,
                "variants": [
                    {
                        "variant_name": view.variant.variant_name,
                        "price": str(view.price.price) if view.price.found else None,
                        "currency": view.price.currency,
                        "stock": view.stock.quantity if view.stock.found else None,
                    }
                    for view in result.variants
                ],
            },
        )

    async def _check_inventory(self, args: dict[str, Any]) -> ToolResult:
        result = await business_brain.find_product(
            self.db, self.business_id, args["product_name"], args.get("variant"), at=self.now
        )

        if not result.found or not result.variants:
            return ToolResult(
                tool=ToolName.CHECK_INVENTORY,
                status=ToolStatus.NOT_FOUND,
                message=result.reason or "product_not_found",
            )

        view = result.variants[0]
        if not view.stock.found:
            return ToolResult(
                tool=ToolName.CHECK_INVENTORY,
                status=ToolStatus.NOT_FOUND,
                message="No inventory record for this variant",
            )

        return ToolResult(
            tool=ToolName.CHECK_INVENTORY,
            status=ToolStatus.SUCCESS,
            data={
                "product_name": result.product.name if result.product else None,
                "variant_name": view.variant.variant_name,
                "quantity": view.stock.quantity,
                "in_stock": view.stock.in_stock,
                "locations": view.stock.locations,
            },
        )

    async def _search_knowledge(self, args: dict[str, Any]) -> ToolResult:
        if self.embedder is None:
            return ToolResult(
                tool=ToolName.SEARCH_KNOWLEDGE,
                status=ToolStatus.UNAVAILABLE,
                message="No embedding provider configured",
            )

        hits = await knowledge.search_knowledge(
            self.db, self.embedder, business_id=self.business_id, query=args["query"]
        )

        if not hits:
            return ToolResult(
                tool=ToolName.SEARCH_KNOWLEDGE,
                status=ToolStatus.NOT_FOUND,
                message="No matching business knowledge",
            )

        return ToolResult(
            tool=ToolName.SEARCH_KNOWLEDGE,
            status=ToolStatus.SUCCESS,
            data={
                "hits": [
                    {
                        "content": hit.content,
                        "document_name": hit.document_name,
                        "document_id": str(hit.document_id),
                        "chunk_index": hit.chunk_index,
                        "score": hit.score,
                    }
                    for hit in hits
                ]
            },
        )

    def _parse_when(self, raw: str):
        return parse_datetime(raw, timezone=self.timezone, now=self.now)

    async def _slot_conflicts(self, start: datetime, end: datetime) -> bool:
        result = await self.db.execute(
            select(Appointment).where(
                Appointment.business_id == self.business_id,
                Appointment.status.in_([AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED]),
                Appointment.start_time < end,
                Appointment.end_time > start,
            )
        )
        return result.scalars().first() is not None

    async def _check_availability(self, args: dict[str, Any]) -> ToolResult:
        parsed = self._parse_when(args["when"])
        if parsed is None:
            return ToolResult(
                tool=ToolName.CHECK_AVAILABILITY,
                status=ToolStatus.INVALID_INPUT,
                message="Could not understand the requested date and time",
            )

        if not parsed.is_complete:
            return ToolResult(
                tool=ToolName.CHECK_AVAILABILITY,
                status=ToolStatus.INVALID_INPUT,
                message="A specific time is needed as well as the day",
                data={"date": parsed.at.isoformat(), "needs": "time"},
            )

        minutes = int(args.get("duration_minutes") or DEFAULT_APPOINTMENT_MINUTES)
        end = parsed.at + timedelta(minutes=minutes)
        conflict = await self._slot_conflicts(parsed.at, end)

        alternatives = []
        if conflict:
            for offset in (minutes, minutes * 2, minutes * 3):
                candidate = parsed.at + timedelta(minutes=offset)
                if not await self._slot_conflicts(
                    candidate, candidate + timedelta(minutes=minutes)
                ):
                    alternatives.append(candidate.isoformat())

        return ToolResult(
            tool=ToolName.CHECK_AVAILABILITY,
            status=ToolStatus.SUCCESS,
            data={
                "requested": parsed.at.isoformat(),
                "available": not conflict,
                "alternatives": alternatives,
                "duration_minutes": minutes,
            },
        )

    async def _book_appointment(self, args: dict[str, Any]) -> ToolResult:
        phone = _normalize_phone(args["phone"])
        if phone is None:
            return ToolResult(
                tool=ToolName.BOOK_APPOINTMENT,
                status=ToolStatus.INVALID_INPUT,
                message="A valid phone number is required",
            )

        parsed = self._parse_when(args["when"])
        if parsed is None or not parsed.is_complete:
            return ToolResult(
                tool=ToolName.BOOK_APPOINTMENT,
                status=ToolStatus.INVALID_INPUT,
                message="A specific date and time is required",
            )

        minutes = int(args.get("duration_minutes") or DEFAULT_APPOINTMENT_MINUTES)
        end = parsed.at + timedelta(minutes=minutes)

        if await self._slot_conflicts(parsed.at, end):
            return ToolResult(
                tool=ToolName.BOOK_APPOINTMENT,
                status=ToolStatus.UNAVAILABLE,
                message="That slot is already taken",
                data={"requested": parsed.at.isoformat()},
            )

        customer = await _get_or_create_customer(self.db, self.business_id, phone, args.get("name"))

        appointment = Appointment(
            business_id=self.business_id,
            customer_id=customer.id,
            start_time=parsed.at,
            end_time=end,
            status=AppointmentStatus.CONFIRMED,
            notes=args.get("notes"),
        )
        self.db.add(appointment)
        await self.db.commit()
        await self.db.refresh(appointment)

        return ToolResult(
            tool=ToolName.BOOK_APPOINTMENT,
            status=ToolStatus.SUCCESS,
            data={
                "appointment_id": str(appointment.id),
                "start_time": appointment.start_time.isoformat(),
                "end_time": appointment.end_time.isoformat(),
                "status": appointment.status,
                "customer_id": str(customer.id),
            },
        )

    async def _create_lead(self, args: dict[str, Any]) -> ToolResult:
        phone = _normalize_phone(args["phone"])
        if phone is None:
            return ToolResult(
                tool=ToolName.CREATE_LEAD,
                status=ToolStatus.INVALID_INPUT,
                message="A valid phone number is required",
            )

        budget = args.get("budget")
        parsed_budget: Decimal | None = None
        if budget is not None:
            try:
                parsed_budget = Decimal(str(budget).replace(",", ""))
            except InvalidOperation:
                return ToolResult(
                    tool=ToolName.CREATE_LEAD,
                    status=ToolStatus.INVALID_INPUT,
                    message="Budget is not a number",
                )

        customer = await _get_or_create_customer(self.db, self.business_id, phone, args.get("name"))

        lead = Lead(
            business_id=self.business_id,
            customer_id=customer.id,
            requirement=args.get("requirement"),
            budget=parsed_budget,
            location=args.get("location"),
            status=LeadStatus.NEW,
        )
        self.db.add(lead)
        await self.db.commit()
        await self.db.refresh(lead)

        return ToolResult(
            tool=ToolName.CREATE_LEAD,
            status=ToolStatus.SUCCESS,
            data={
                "lead_id": str(lead.id),
                "customer_id": str(customer.id),
                "status": lead.status,
            },
        )

    async def _update_crm(self, args: dict[str, Any]) -> ToolResult:
        try:
            lead_id = uuid.UUID(str(args["lead_id"]))
        except ValueError:
            return ToolResult(
                tool=ToolName.UPDATE_CRM,
                status=ToolStatus.INVALID_INPUT,
                message="lead_id is not a valid identifier",
            )

        lead = await self.db.get(Lead, lead_id)
        if lead is None or lead.business_id != self.business_id:
            return ToolResult(
                tool=ToolName.UPDATE_CRM,
                status=ToolStatus.NOT_FOUND,
                message="Lead not found",
            )

        if args.get("status"):
            try:
                lead.status = LeadStatus(args["status"])
            except ValueError:
                return ToolResult(
                    tool=ToolName.UPDATE_CRM,
                    status=ToolStatus.INVALID_INPUT,
                    message=f"Unknown lead status '{args['status']}'",
                )

        if args.get("summary"):
            lead.summary = args["summary"]

        await self.db.commit()
        return ToolResult(
            tool=ToolName.UPDATE_CRM,
            status=ToolStatus.SUCCESS,
            data={"lead_id": str(lead.id), "status": lead.status},
        )

    async def _send_via_whatsapp(self, tool: ToolName, phone: str, message: str) -> ToolResult:
        normalized = _normalize_phone(phone)
        if normalized is None:
            return ToolResult(
                tool=tool,
                status=ToolStatus.INVALID_INPUT,
                message="A valid phone number is required",
            )

        if self.whatsapp is None:
            # No provider configured. Reporting success here would tell the
            # caller a message was sent when nothing was.
            return ToolResult(
                tool=tool,
                status=ToolStatus.UNAVAILABLE,
                message="WhatsApp is not connected for this business",
            )

        response = await self.whatsapp.send_message(normalized, message)
        return ToolResult(
            tool=tool,
            status=ToolStatus.SUCCESS,
            data={"phone": normalized, "provider_response": response},
        )

    async def _send_whatsapp(self, args: dict[str, Any]) -> ToolResult:
        return await self._send_via_whatsapp(ToolName.SEND_WHATSAPP, args["phone"], args["message"])

    async def _send_brochure(self, args: dict[str, Any]) -> ToolResult:
        product = await business_brain.find_product(
            self.db, self.business_id, args["product_name"], at=self.now
        )
        if not product.found:
            return ToolResult(
                tool=ToolName.SEND_BROCHURE,
                status=ToolStatus.NOT_FOUND,
                message="No such product to send a brochure for",
            )

        return await self._send_via_whatsapp(
            ToolName.SEND_BROCHURE,
            args["phone"],
            f"Details for {args['product_name']}",
        )

    async def _send_location(self, args: dict[str, Any]) -> ToolResult:
        return await self._send_via_whatsapp(
            ToolName.SEND_LOCATION, args["phone"], "Store location"
        )

    async def _transfer_to_human(self, args: dict[str, Any]) -> ToolResult:
        return ToolResult(
            tool=ToolName.TRANSFER_TO_HUMAN,
            status=ToolStatus.SUCCESS,
            data={"reason": args.get("reason", "customer_request")},
        )
