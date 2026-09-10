import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { SearchResult, VectorRetriever } from "./vector-store";
import { Document } from "./text-splitter";

export interface GenerateResponseOptions {
  query: string;
  contextChunks: SearchResult[];
  employee: {
    name: string;
    description?: string | null;
    tone?: string;
    language?: string;
  };
  businessName?: string;
}

export interface QAResult {
  answer: string;
  confidence: number;
  sources: string[];
}

/**
 * Helper to initialize ChatGroq model instance
 */
export function getChatGroq(customApiKey?: string, modelOverride?: string): ChatGroq | null {
  const apiKey = customApiKey || process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }

  try {
    return new ChatGroq({
      apiKey: apiKey.trim(),
      model: modelOverride || process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
      temperature: 0.2,
      maxTokens: 1500,
    });
  } catch (err) {
    console.warn("Failed to initialize ChatGroq:", err);
    return null;
  }
}

/**
 * 1. AI Summary Generation
 * Summarizes business documents, price lists, or voice transcripts using Groq LLM
 */
export async function generateDocumentSummary(text: string, docName?: string): Promise<string> {
  const llm = getChatGroq();
  if (!llm) {
    // Fallback if GROQ_API_KEY not yet configured in .env
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned.slice(0, 200) + (cleaned.length > 200 ? "..." : "");
  }

  try {
    const summaryPrompt = PromptTemplate.fromTemplate(`
You are an expert business knowledge analyst. Summarize the following business document in 2-3 concise, informative sentences.
Highlight the primary products, services, prices, offers, or operating policies covered.

Document Name: {docName}
Content:
"""
{text}
"""

Summary:
`);

    let response = "";
    try {
      const chain = summaryPrompt.pipe(llm).pipe(new StringOutputParser());
      response = await chain.invoke({
        docName: docName || "Business Document",
        text: text.slice(0, 4000), // First 4k chars for summary
      });
    } catch (primaryErr) {
      const fallbackLlm = getChatGroq(undefined, "openai/gpt-oss-20b");
      if (fallbackLlm) {
        const fallbackChain = summaryPrompt.pipe(fallbackLlm).pipe(new StringOutputParser());
        response = await fallbackChain.invoke({
          docName: docName || "Business Document",
          text: text.slice(0, 4000),
        });
      } else {
        throw primaryErr;
      }
    }

    return response.trim();
  } catch (err: any) {
    console.warn("Groq summary generation failed, using excerpt:", err?.message);
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned.slice(0, 200) + (cleaned.length > 200 ? "..." : "");
  }
}

/**
 * LangChain RetrievalQA implementation
 * Mirrors:
 *   qa_chain = RetrievalQA.from_chain_type(llm, retriever=retriever)
 *   response = qa_chain.invoke({"query": query})
 */
export class RetrievalQA {
  private llm: ChatGroq | null;
  private retriever: VectorRetriever;
  private promptTemplate: PromptTemplate;
  private employeeName: string;
  private businessName: string;

  constructor(fields: {
    llm: ChatGroq | null;
    retriever: VectorRetriever;
    employeeName?: string;
    businessName?: string;
    employeeTone?: string;
  }) {
    this.llm = fields.llm;
    this.retriever = fields.retriever;
    this.employeeName = fields.employeeName || "Voice Agent";
    this.businessName = fields.businessName || "our business";

    this.promptTemplate = PromptTemplate.fromTemplate(`
You are {employeeName}, an intelligent and friendly AI Employee at {businessName}.
Tone: {employeeTone}.

Your job is to assist customers and leads accurately based ONLY on the provided business knowledge context below.

Context:
---------------------
{context}
---------------------

Question from Customer:
"{query}"

Guidelines:
1. Answer directly and naturally in a friendly, conversational tone, as {employeeName}.
2. Present prices, products, and offers clearly and neatly using bullet points or concise sentences. Do NOT dump raw pipe tables.
3. If the context does not contain the answer, politely state that you do not have that exact information on hand, and offer to take their details so the team can get back to them.
4. Keep the response concise, helpful, and invite further questions.

Answer:
`);
  }

  static fromLLMAndRetriever(
    llm: ChatGroq | null,
    retriever: VectorRetriever,
    options?: {
      employeeName?: string;
      businessName?: string;
      employeeTone?: string;
    }
  ): RetrievalQA {
    return new RetrievalQA({
      llm,
      retriever,
      employeeName: options?.employeeName || "Voice Agent",
      businessName: options?.businessName || "our business",
      employeeTone: options?.employeeTone || "Professional, helpful, and courteous",
    });
  }

  async invoke(input: { query: string }): Promise<{
    answer: string;
    sourceDocuments: Document[];
  }> {
    const docs = await this.retriever.getRelevantDocuments(input.query);
    const contextText = docs.length > 0
      ? docs.map((d, i) => `[Document ${i + 1}]:\n${d.pageContent}`).join("\n\n")
      : "No matching business knowledge records found.";

    if (!this.llm) {
      // Fallback synthesis if GROQ_API_KEY is not yet in .env
      const fallback = synthesizeFallbackResponse({
        query: input.query,
        contextChunks: docs.map((d) => ({
          id: d.metadata?.id || "doc",
          documentId: d.metadata?.documentId || "doc",
          content: d.pageContent,
          metadata: d.metadata,
          similarity: d.metadata?.similarity || 0.8,
        })),
        employeeName: this.employeeName || "Voice Agent",
        businessName: this.businessName || "our business",
      });
      return {
        answer: fallback.answer,
        sourceDocuments: docs,
      };
    }

    const chain = this.promptTemplate.pipe(this.llm).pipe(new StringOutputParser());
    const answer = await chain.invoke({
      context: contextText,
      query: input.query,
    });

    return {
      answer: answer.trim(),
      sourceDocuments: docs,
    };
  }
}

/**
 * Synthesizes response for lead queries using Groq LLM and retrieved context chunks
 */
export async function synthesizeLeadResponse(options: GenerateResponseOptions): Promise<QAResult> {
  const { query, contextChunks, employee, businessName = "our business" } = options;

  const sources = Array.from(
    new Set(
      contextChunks
        .map((c) => (c.metadata?.sourceName ? String(c.metadata.sourceName) : "Business Knowledge"))
        .filter(Boolean)
    )
  );

  if (!contextChunks || contextChunks.length === 0) {
    return {
      answer: `Hello! I'm ${employee.name} from ${businessName}. I don't have that specific detail in our current records right now, but I would be glad to take your contact number and requirement, and our team will get back to you with the exact details right away. May I have your name and phone number?`,
      confidence: 0.2,
      sources: [],
    };
  }

  const topSimilarity = contextChunks[0]?.similarity ?? 0.8;
  const llm = getChatGroq();

  if (llm) {
    try {
      const contextText = contextChunks
        .map((c, i) => `[Source ${i + 1}]:\n${c.content}`)
        .join("\n\n");

      const prompt = PromptTemplate.fromTemplate(`
You are {employeeName}, a knowledgeable and courteous AI representative at {businessName}.
Tone: {employeeTone}.

Customer Query:
"{query}"

Business Knowledge Context:
---------------------
{context}
---------------------

Instructions:
1. Provide a polite, helpful, and direct answer as {employeeName}.
2. If the user asks about products, models, prices, or costs, provide the exact details, model names, and prices from the context. Always format prices clearly using Rupee symbol (₹).
3. If the user asks for details or a price list, provide a comprehensive, well-structured response covering the available models and categories in the context.
4. Keep the phrasing clear, conversational, and natural so it sounds great both in text and when spoken by a voice agent.
5. If specific information is requested that is not in the context, politely state you'll verify with the team.
6. End with an appropriate helpful call to action or offer to assist further.

Response:
`);

      let generatedAnswer = "";
      try {
        const chain = prompt.pipe(llm).pipe(new StringOutputParser());
        generatedAnswer = await chain.invoke({
          employeeName: employee.name,
          businessName,
          employeeTone: employee.tone || "Courteous, helpful, and professional",
          query,
          context: contextText,
        });
      } catch (primaryErr: any) {
        // Try fallback to openai/gpt-oss-20b
        const fallbackLlm = getChatGroq(undefined, "openai/gpt-oss-20b");
        if (fallbackLlm) {
          const fallbackChain = prompt.pipe(fallbackLlm).pipe(new StringOutputParser());
          generatedAnswer = await fallbackChain.invoke({
            employeeName: employee.name,
            businessName,
            employeeTone: employee.tone || "Courteous, helpful, and professional",
            query,
            context: contextText,
          });
        } else {
          throw primaryErr;
        }
      }

      return {
        answer: generatedAnswer.trim(),
        confidence: Math.min(0.99, Math.max(0.65, topSimilarity)),
        sources,
      };
    } catch (err: any) {
      console.warn("Groq generation failed, falling back to clean formatter:", err?.message);
    }
  }

  // Fallback when GROQ_API_KEY is not configured or rate-limited
  return synthesizeFallbackResponse({
    query,
    contextChunks,
    employeeName: employee.name,
    businessName,
    sources,
    topSimilarity,
  });
}

function synthesizeFallbackResponse(params: {
  query: string;
  contextChunks: SearchResult[];
  employeeName: string;
  businessName: string;
  sources?: string[];
  topSimilarity?: number;
}): QAResult {
  const { query, contextChunks, employeeName, businessName } = params;
  const topChunk = contextChunks[0]?.content || "";

  // Clean raw table pipes into readable text if present
  const cleanContent = cleanTablePipes(topChunk);

  const isGreeting = /^(hi|hello|hey|good morning|namaste)/i.test(query.trim());
  const prefix = isGreeting
    ? `Hello! I'm ${employeeName} from ${businessName}. `
    : `Regarding your inquiry with ${businessName}: `;

  const answer = `${prefix}${cleanContent}`;

  return {
    answer,
    confidence: Math.min(0.95, params.topSimilarity || 0.75),
    sources: params.sources || ["Business Knowledge"],
  };
}

function cleanTablePipes(rawText: string): string {
  if (!rawText.includes("|")) return rawText.trim();

  // Convert markdown table rows into clean bullet points
  const lines = rawText.split("\n");
  const cleanLines: string[] = [];

  for (const line of lines) {
    if (/^[|\s\-:]+$/.test(line)) continue; // skip divider
    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        cleanLines.push(`• ${parts.join(" — ")}`);
        continue;
      }
    }
    cleanLines.push(line);
  }

  return cleanLines.filter((l) => l.trim().length > 0).join("\n");
}

export interface BusinessCallScript {
  businessName: string;
  employeeName: string;
  openingMessage: string;
  valueProposition: string[];
  keyOfferings: string[];
  qualificationQuestions: string[];
  faqResponses: Array<{ question: string; answer: string }>;
  objectionHandling: Array<{ objection: string; response: string }>;
  closingCta: string;
  fullScript: string;
  generatedAt: string;
}

/**
 * Prepares a tailored outbound calling script for a specific business
 * based on its uploaded documents and voice transcripts.
 */
export async function generateBusinessCallScript(params: {
  businessName: string;
  employeeName: string;
  employeeRole?: string;
  documents: Array<{
    name: string;
    summary?: string | null;
    raw_text?: string;
    source_type?: string;
  }>;
}): Promise<BusinessCallScript> {
  const { businessName, employeeName, employeeRole = "Sales & Customer Support Voice Agent", documents } = params;

  const docSummaries = documents
    .map((d, i) => {
      const content = d.raw_text?.replace(/\bn(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?)\b/g, "₹$1").trim() || d.summary || "";
      return `[Source ${i + 1} - ${d.name} (${d.source_type || "document"})]:\n${content}`;
    })
    .join("\n\n");

  const knowledgeContext = docSummaries.trim() || `General customer inquiries and pricing follow-up for ${businessName}.`;

  const llm = getChatGroq();
  if (llm) {
    try {
      const scriptPrompt = PromptTemplate.fromTemplate(`
You are an elite telephone sales coach and conversation designer.
Your task is to analyze the following business knowledge base for "{businessName}" and synthesize an engaging, authentic, high-converting outbound calling script for AI agent "{employeeName}" ({employeeRole}).

The AI agent will speak with Indian & global customers over the phone. Keep language natural, polite, respectful, and consultative (English with warm touch).

BUSINESS KNOWLEDGE & UPLOADED DOCUMENTS:
"""
{knowledgeContext}
"""

You MUST output ONLY a valid JSON object matching the following structure exactly (no markdown backticks, no preamble):
{{
  "openingMessage": "Engaging 1-2 sentence hook introducing employee from businessName, referencing customer inquiry or offer, asking for 2 minutes",
  "valueProposition": [
    "Primary value proposition 1 from the documents",
    "Primary value proposition 2",
    "Primary value proposition 3"
  ],
  "keyOfferings": [
    "Product or Service 1 with price or key benefit if in documents",
    "Product or Service 2 with price or key benefit if in documents"
  ],
  "qualificationQuestions": [
    "Question 1 to ask the customer to understand their specific requirement",
    "Question 2 to identify timeline or preferred package"
  ],
  "faqResponses": [
    {{"question": "How much does it cost / What are your prices?", "answer": "Clear response based on the uploaded documents"}},
    {{"question": "What are your business hours and location?", "answer": "Accurate response from documents"}},
    {{"question": "What is your warranty or refund policy?", "answer": "Policy from documents"}}
  ],
  "objectionHandling": [
    {{"objection": "I am busy right now / Call back later", "response": "Polite acknowledgment and offer to send details on WhatsApp or schedule exact callback time"}},
    {{"objection": "Your price seems too high", "response": "Explain the value, quality, or flexible payment options mentioned in documents"}}
  ],
  "closingCta": "Clear closing statement to schedule a consultation, visit, or send quote over WhatsApp/Email",
  "fullScript": "A complete, natural 2-way phone dialogue between {employeeName} and the Customer from greeting to closing CTA"
}}
`);

      const chain = scriptPrompt.pipe(llm).pipe(new StringOutputParser());
      const rawOutput = await chain.invoke({
        businessName,
        employeeName,
        employeeRole,
        knowledgeContext: knowledgeContext.slice(0, 6000),
      });

      // Parse JSON from output
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          businessName,
          employeeName,
          openingMessage: parsed.openingMessage || `Hello! This is ${employeeName} calling from ${businessName}. How can I assist you today?`,
          valueProposition: Array.isArray(parsed.valueProposition) ? parsed.valueProposition : ["Tailored solutions for your needs", "Reliable support and competitive pricing"],
          keyOfferings: Array.isArray(parsed.keyOfferings) ? parsed.keyOfferings : ["Standard & Premium Packages"],
          qualificationQuestions: Array.isArray(parsed.qualificationQuestions) ? parsed.qualificationQuestions : ["What specific service or product are you looking for?"],
          faqResponses: Array.isArray(parsed.faqResponses) ? parsed.faqResponses : [],
          objectionHandling: Array.isArray(parsed.objectionHandling) ? parsed.objectionHandling : [],
          closingCta: parsed.closingCta || `Would you like me to send our complete brochure and pricing details to your WhatsApp?`,
          fullScript: parsed.fullScript || rawOutput,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch (llmErr) {
      console.warn("Groq script generation error, falling back to rule-based synthesizer:", llmErr);
    }
  }

  // Robust Rule-Based Knowledge Synthesizer Fallback
  return synthesizeRuleBasedScript({
    businessName,
    employeeName,
    documents,
  });
}

function synthesizeRuleBasedScript(params: {
  businessName: string;
  employeeName: string;
  documents: Array<{
    name: string;
    summary?: string | null;
    raw_text?: string;
  }>;
}): BusinessCallScript {
  const { businessName, employeeName, documents } = params;

  // Extract key phrases, prices, and lines from documents
  const allText = documents
    .map((d) => (d.summary || "") + " " + (d.raw_text || ""))
    .join("\n");

  const priceMatches = allText.match(/(?:₹|Rs\.?|INR|\$)\s*[\d,]+(?:\s*\/\s*(?:mo|month|year|yr|unit))?/gi) || [];
  const uniquePrices = Array.from(new Set(priceMatches)).slice(0, 4);

  // Extract candidate bullet points from lines
  const lines = allText
    .split("\n")
    .map((l) => l.replace(/^[•\-*\d.]+\s*/, "").trim())
    .filter((l) => l.length > 20 && l.length < 150);

  const valuePoints = lines.slice(0, 3).length > 0
    ? lines.slice(0, 3)
    : [
        `High-quality products and services customized for ${businessName} clients`,
        `Dedicated customer support with flexible scheduling`,
        `Transparent and competitive pricing without hidden fees`,
      ];

  const keyOfferings = uniquePrices.length > 0
    ? uniquePrices.map((p, idx) => `Package ${String.fromCharCode(65 + idx)} starting at ${p}`)
    : [
        `${businessName} Core Services & Consultations`,
        `Custom packages tailored to client specifications`,
      ];

  const openingMessage = `Hello! I am calling from ${businessName} regarding your recent inquiry. Am I speaking with the customer?`;

  const closingCta = `Thank you for your time! I can immediately send our full catalogue, pricing breakdown, and booking confirmation directly to your WhatsApp or email. May I confirm this number?`;

  const fullScript = `
[PHONE RINGS - CUSTOMER PICKS UP]

${employeeName}: "Namaste! This is ${employeeName} calling from ${businessName}. I noticed your inquiry regarding our services. Do you have two quick minutes to talk?"

Customer: "Yes, sure. What is this regarding?"

${employeeName}: "We specialize in ${valuePoints[0] || "tailored business solutions"}. I wanted to share our latest pricing options and see which package best fits your requirements."

Customer: "What are your charges and options?"

${employeeName}: "${keyOfferings.join(". ")}. We also provide dedicated support and flexible payment methods."

Customer: "Can you send me the details so I can review with my team?"

${employeeName}: "${closingCta}"

Customer: "Yes, please send it on WhatsApp."

${employeeName}: "Wonderful! It has been dispatched. Have a wonderful day ahead from all of us at ${businessName}!"
`.trim();

  return {
    businessName,
    employeeName,
    openingMessage,
    valueProposition: valuePoints,
    keyOfferings,
    qualificationQuestions: [
      `What is your primary requirement or budget for ${businessName}?`,
      `Are you looking for an immediate solution, or planning for next month?`,
    ],
    faqResponses: [
      {
        question: "What are your prices?",
        answer: uniquePrices.length > 0
          ? `Our pricing starts at ${uniquePrices[0]} with customized options available.`
          : `We offer competitive rates with transparent pricing tailored to your requirements.`,
      },
      {
        question: "How do I get started or book an appointment?",
        answer: `We can confirm your slot right now, or send a booking link directly to your phone.`,
      },
    ],
    objectionHandling: [
      {
        objection: "I'm busy right now / Call me later",
        response: `I completely understand! What time later today or tomorrow would work best for a quick 2-minute follow-up?`,
      },
      {
        objection: "Is there any discount available?",
        answer: `Yes, we offer special introductory rates and discounts for early bookings!`,
      } as any,
    ],
    closingCta,
    fullScript,
    generatedAt: new Date().toISOString(),
  };
}

