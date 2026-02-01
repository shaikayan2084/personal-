
import { GoogleGenAI, Type } from "@google/genai";
import { BankStats, AnalysisResponse } from "../types";

// Removed global helper to ensure strictly compliant initialization format
export const analyzeFederatedData = async (aggregatedStats: BankStats[]): Promise<AnalysisResponse> => {
  // Always use the specified initialization format directly with process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    As a world-class financial security expert, analyze the following aggregated metrics from multiple banking institutions. 
    DATA FROM ${aggregatedStats.length} MEMBER BANKS:
    ${JSON.stringify(aggregatedStats, null, 2)}
    TASK: Identify network-wide fraud patterns and risk levels.
    Return strictly in JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          riskLevel: { type: Type.STRING },
          summary: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          detectedPatterns: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["riskLevel", "summary", "recommendations", "detectedPatterns"]
      }
    }
  });

  // Directly access .text property from GenerateContentResponse
  const text = response.text || '{}';
  return JSON.parse(text) as AnalysisResponse;
};

export const predictFraudProbability = async (amount: number, riskScore: number): Promise<{ isFraud: boolean; probability: number; reason: string }> => {
  // Instantiate GoogleGenAI inside the function as recommended
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    ML INFERENCE MODE:
    Input Features:
    - Amount: ${amount}
    - Device Risk Score: ${riskScore} (0-100)
    
    Predict the probability of this being a fraudulent transaction. 
    High amounts + high risk scores are likely fraud.
    Return JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isFraud: { type: Type.BOOLEAN },
          probability: { type: Type.NUMBER },
          reason: { type: Type.STRING }
        },
        required: ["isFraud", "probability", "reason"]
      }
    }
  });

  // Directly access .text property
  const text = response.text || '{}';
  return JSON.parse(text);
};
