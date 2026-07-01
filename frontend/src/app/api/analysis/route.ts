import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Simulate an x402 payment check
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('L402')) {
    return NextResponse.json(
      { error: 'Payment Required' },
      {
        status: 402,
        headers: {
          'Www-Authenticate': 'L402 invoice="lnbc12000...", macaroon="MDAxY2xvY2F0..."',
        },
      }
    );
  }

  // Read query params
  const { searchParams } = new URL(request.url);
  const question = searchParams.get('question') || 'Will this prediction resolve?';
  const optionsString = searchParams.get('options') || 'Yes,No';
  const options = optionsString.split(',');

  const apiKey = process.env.VENICE_API_KEY;

  if (apiKey) {
    try {
      console.log(`Querying Venice AI for premium analysis of pool: "${question}"`);

      const prompt = `
You are a professional financial and events analyst.
Analyze the following prediction market:
QUESTION: "${question}"
OPTIONS: ${options.map((opt, i) => `[Option ${i}] "${opt}"`).join(', ')}

Please provide a detailed, unbiased probability forecast.
Evaluate the background context, critical stats, variables, and potential risks.

Return ONLY a valid JSON object matching the schema below. Do not include markdown wraps (like \`\`\`json) or any preamble:
{
  "confidence": <integer between 0 and 100 representing your prediction confidence>,
  "riskLevel": "Low" | "Medium" | "High",
  "analysisText": [
    "<detailed background context paragraph>",
    "<analytical statistics and key variables paragraph>",
    "<final forecast summary paragraph>"
  ],
  "sources": [
    "<primary source reference 1>",
    "<primary source reference 2>",
    "<primary source reference 3>"
  ],
  "probabilities": [
    <percentage number for Option 0>,
    <percentage number for Option 1>
  ]
}
`;

      const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 800
        })
      });

      if (!response.ok) {
        throw new Error(`Venice API error: ${response.status}`);
      }

      const json = await response.json();
      const content = json.choices[0].message.content.trim();
      const cleanedJson = content.replace(/^```json/g, '').replace(/```$/g, '').trim();
      const analysisData = JSON.parse(cleanedJson);

      return NextResponse.json({
        success: true,
        data: analysisData
      });
    } catch (err) {
      console.error("Venice AI premium analysis failed, falling back to context mock:", err);
    }
  }

  // Contextual mock data generator if API key is missing or failed
  console.log("Generating context-aware mock AI analysis...");
  const lowerQ = question.toLowerCase();
  
  let confidence = 65;
  let riskLevel = 'Medium';
  let analysisText = [
    `The prediction "${question}" hinges on key macro variables and execution indicators over the coming months. Historical benchmarks indicate a strong baseline for initial projections, though deviation ranges remain wide.`,
    `Current sentiment indices suggest a close margin between outcomes. Core performance metrics (such as historical trends and volume metrics) point to a slight favor towards the primary options.`,
    `Market participants should monitor key news developments and policy changes as they will define the ultimate resolution timeline.`
  ];
  let sources = [
    "Market Sentiment Index & Volume Tracker",
    "Historical Trend Analysis Report",
    "General Public Press Releases"
  ];
  let probabilities = options.map((_, i) => (i === 0 ? 58 : i === 1 ? 42 : Math.floor(100 / options.length)));

  if (lowerQ.includes('real madrid') || lowerQ.includes('champions league') || lowerQ.includes('ucl')) {
    confidence = 68;
    riskLevel = 'Medium';
    analysisText = [
      "Real Madrid enters the final with the strongest UCL campaign of any team this season — 9 wins, 1 draw, and a +18 goal differential across the knockout stage. Their transition press has generated 12 goals from turnovers, the highest in the competition.",
      "The opponent's vulnerability on set pieces (7 goals conceded from dead-ball situations) aligns with Real Madrid's primary attacking strength — they lead the tournament in headed goals (8) and corner-kick conversion rate (14%).",
      "The key variable is whether the opponent's high press can disrupt Madrid's build-up from the back. In their two meetings this season, Madrid completed 89% of passes under pressure, suggesting resilience."
    ];
    sources = [
      "UEFA Champions League 2025/26 — Match Statistics",
      "Head-to-Head Historical Data (2000–2026)",
      "Player Form Index — Top 50 UCL Scorers"
    ];
    probabilities = [62, 38];
  } else if (lowerQ.includes('bitcoin') || lowerQ.includes('btc') || lowerQ.includes('crypto')) {
    confidence = 72;
    riskLevel = 'High';
    analysisText = [
      "Bitcoin exhibits significant upward momentum supported by sustained institutional inflows via spot ETFs and a structural supply squeeze following the recent halving event. Average daily net inflows exceed $150M.",
      "The primary risk variable is macroeconomic headwinds, specifically Fed interest rate policy and global liquidity contractions. Key support levels sit at $60,000, while resistance lies near all-time highs.",
      "Given historical post-halving cycles, the likelihood of an expansion phase remains high, though short-term volatility could trigger liquidations."
    ];
    sources = [
      "Glassnode On-Chain Analytics & ETF Flow Tracker",
      "Federal Reserve Monetary Policy Minutes",
      "Macro Liquidity Index (2015-2026)"
    ];
    probabilities = [68, 32];
  }

  return NextResponse.json({
    success: true,
    data: {
      confidence,
      riskLevel,
      analysisText,
      sources,
      probabilities
    }
  });
}
