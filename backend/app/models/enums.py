from enum import StrEnum


class UserRole(StrEnum):
    """Platform-level role. Internal staff manage AI complexity for businesses."""

    PLATFORM_ADMIN = "platform_admin"
    AI_TRAINER = "ai_trainer"
    BUSINESS_USER = "business_user"


class BusinessMemberRole(StrEnum):
    """Role of a user within a specific business tenant."""

    OWNER = "owner"
    MANAGER = "manager"
    STAFF = "staff"


class BusinessStatus(StrEnum):
    ACTIVE = "active"
    ONBOARDING = "onboarding"
    SUSPENDED = "suspended"


class AIEmployeeStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"


class AIVersionStatus(StrEnum):
    DRAFT = "draft"
    TESTING = "testing"
    APPROVED = "approved"
    LIVE = "live"
    ARCHIVED = "archived"


class ProductStatus(StrEnum):
    ACTIVE = "active"
    DISCONTINUED = "discontinued"
    OUT_OF_STOCK = "out_of_stock"


class OfferStatus(StrEnum):
    ACTIVE = "active"
    PAUSED = "paused"
    EXPIRED = "expired"


class ContentStatus(StrEnum):
    """Publication state for FAQs and rules."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class RuleType(StrEnum):
    POLICY = "policy"
    ESCALATION = "escalation"
    RESTRICTION = "restriction"
    WORKFLOW = "workflow"


class DocumentSourceType(StrEnum):
    UPLOAD = "upload"
    WEBSITE = "website"
    MANUAL = "manual"


class DocumentStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class Language(StrEnum):
    ENGLISH = "en"
    TELUGU = "te"
    TANGLISH = "te-en"
    UNKNOWN = "unknown"


class ConversationState(StrEnum):
    GREETING = "greeting"
    UNDERSTANDING = "understanding"
    QUALIFYING = "qualifying"
    ANSWERING = "answering"
    ACTION = "action"
    CLOSING = "closing"
    ESCALATED = "escalated"
    ENDED = "ended"


class TurnRole(StrEnum):
    CUSTOMER = "customer"
    AI = "ai"
    SYSTEM = "system"


class EscalationReason(StrEnum):
    CUSTOMER_REQUEST = "customer_request"
    UNGROUNDED_ANSWER = "ungrounded_answer"
    UNKNOWN_INFORMATION = "unknown_information"
    BUSINESS_RULE = "business_rule"
    REPEATED_FAILURE = "repeated_failure"
    PROVIDER_FAILURE = "provider_failure"


class Intent(StrEnum):
    """What the caller is trying to do this turn."""

    GREETING = "greeting"
    PRODUCT_PRICE = "product_price"
    PRODUCT_INFO = "product_info"
    INVENTORY = "inventory"
    COMPARISON = "comparison"
    POLICY_QUESTION = "policy_question"
    APPOINTMENT = "appointment"
    SEND_WHATSAPP = "send_whatsapp"
    SEND_LOCATION = "send_location"
    SEND_BROCHURE = "send_brochure"
    HUMAN_TRANSFER = "human_transfer"
    PROVIDE_DETAILS = "provide_details"
    SMALL_TALK = "small_talk"
    UNKNOWN = "unknown"


class RouteSource(StrEnum):
    """Where the answer for this turn must come from."""

    STRUCTURED_DATA = "structured_data"
    KNOWLEDGE_BASE = "knowledge_base"
    INVENTORY = "inventory"
    CALENDAR = "calendar"
    WHATSAPP = "whatsapp"
    CRM = "crm"
    HUMAN = "human"
    NONE = "none"


class ToolName(StrEnum):
    FIND_PRODUCT = "find_product"
    CHECK_INVENTORY = "check_inventory"
    SEARCH_KNOWLEDGE = "search_knowledge"
    CHECK_AVAILABILITY = "check_availability"
    BOOK_APPOINTMENT = "book_appointment"
    CREATE_LEAD = "create_lead"
    UPDATE_CRM = "update_crm"
    SEND_WHATSAPP = "send_whatsapp"
    SEND_BROCHURE = "send_brochure"
    SEND_LOCATION = "send_location"
    TRANSFER_TO_HUMAN = "transfer_to_human"


class ToolStatus(StrEnum):
    SUCCESS = "success"
    NOT_FOUND = "not_found"
    INVALID_INPUT = "invalid_input"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"


class LeadStatus(StrEnum):
    NEW = "new"
    QUALIFIED = "qualified"
    CONTACTED = "contacted"
    CONVERTED = "converted"
    LOST = "lost"


class AppointmentStatus(StrEnum):
    REQUESTED = "requested"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


class CallDirection(StrEnum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class CallStatus(StrEnum):
    RINGING = "ringing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    TRANSFERRED = "transferred"


class CallOutcome(StrEnum):
    ANSWERED = "answered"
    QUALIFIED_LEAD = "qualified_lead"
    APPOINTMENT_BOOKED = "appointment_booked"
    INFORMATION_SENT = "information_sent"
    TRANSFERRED_TO_HUMAN = "transferred_to_human"
    NO_RESOLUTION = "no_resolution"
    DROPPED = "dropped"


class RecordingConsent(StrEnum):
    """Recording is only stored where the caller has agreed."""

    NOT_ASKED = "not_asked"
    GRANTED = "granted"
    DECLINED = "declined"


INTERNAL_ROLES = {UserRole.PLATFORM_ADMIN, UserRole.AI_TRAINER}
