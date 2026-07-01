import dotenv from 'dotenv';
dotenv.config();

export interface Pool {
  id: string;
  question: string;
  options: string[];
}

export interface Evidence {
  source: string;
  content: string;
}

export interface VerdictJSON {
  winningOptionId: number | null;
  winningOption: string | null;
  status: 'RESOLVED' | 'UNRESOLVABLE';
  confidence: number;
  reasoning: string;
  sources: string[];
  resolvedAt: string;
}

export async function buildResolutionPrompt(pool: Pool, evidence: Evidence[]): Promise<string> {
  return `
You are a neutral prediction market resolution oracle.
Your job is to determine the correct outcome of a prediction.
You must reason carefully, cite your evidence, and return ONLY valid JSON.

PREDICTION: "${pool.question}"

OPTIONS:
${pool.options.map((o, i) => `  ${i}: "${o}"`).join('\n')}

EVIDENCE:
${evidence.map(e => `[${e.source}] ${e.content}`).join('\n\n')}

RESOLUTION RULES:
- Choose the option that most accurately reflects verified facts
- If evidence is insufficient or contradictory, set status to "UNRESOLVABLE"
- Do not choose based on market sentiment or stake distribution
- Cite at least 2 independent sources for your decision

Return ONLY this JSON object, no preamble, no markdown:
{
  "winningOptionId": <number or null>,
  "winningOption": "<string or null>",
  "status": "RESOLVED" | "UNRESOLVABLE",
  "confidence": <0.0–1.0>,
  "reasoning": "<2–3 sentences>",
  "sources": ["<url or description>"],
  "resolvedAt": "<ISO 8601 timestamp>"
}
`;
}

export async function callVeniceOracle(prompt: string): Promise<VerdictJSON> {
  console.log('Calling Venice AI with prompt length:', prompt.length);
  
  if (!process.env.VENICE_API_KEY) {
    throw new Error("Missing VENICE_API_KEY");
  }

  const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.VENICE_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b', // or 'venice-uncensored'
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, // low temp for deterministic resolution
      max_tokens: 512
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Venice AI API Error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content;
  
  // Clean up potential markdown formatting from the response
  const jsonStr = raw.replace(/^```json/g, '').replace(/```$/g, '').trim();
  
  return JSON.parse(jsonStr) as VerdictJSON;
}

export async function gatherEvidence(question: string, options: string[]): Promise<Evidence[]> {
  console.log(`Gathering evidence for: ${question}`);
  
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ TAVILY_API_KEY is not set. Falling back to mock evidence.");
    return [
      {
        source: "UEFA Champions League 2025/26 — Match Statistics",
        content: "Real Madrid enters the 2026 final with 9 wins, 1 draw, and a +18 goal differential across the knockout stage. Their transition press has generated 12 goals from turnovers."
      },
      {
        source: "Head-to-Head Historical Data (2000–2026)",
        content: "Real Madrid has an undefeated record against the opponent in the last 3 meetings."
      }
    ];
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: question,
        search_depth: "advanced",
        max_results: 5,
      }),
    });

    if (!res.ok) {
      throw new Error(`Tavily API responded with status ${res.status}`);
    }

    const data = (await res.json()) as { results?: Array<{ title: string; content: string; url?: string }> };
    
    if (data.results && data.results.length > 0) {
      return data.results.map((r) => ({
        source: `${r.title} (${r.url || "Tavily Search"})`,
        content: r.content,
      }));
    } else {
      console.warn("Tavily returned no search results.");
    }
  } catch (err) {
    console.error("Failed to gather evidence via Tavily:", err);
  }

  // Fallback if Tavily fails or returns empty results
  return [
    {
      source: "Search Fallback",
      content: `No active internet results found for the question: "${question}".`
    }
  ];
}
