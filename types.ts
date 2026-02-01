
export interface BankStats {
  bankId: string;
  bankName: string;
  totalTransactions: number;
  totalAmountWithdrawn: number;
  avgWithdrawalAmount: number;
  anomalyRate: number;
  highRiskRegions: string[];
  peakActivityHours: string[];
}

export interface Transaction {
  id: string;
  timestamp: number;
  amount: number;
  deviceRiskScore: number;
  location: string;
  isFraud: boolean;
  probability: number;
  status: 'Encrypted' | 'Processing' | 'Completed';
}

export interface TransactionShare {
  partyId: string;
  shareValue: number;
}

export interface AnalysisResponse {
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: string;
  recommendations: string[];
  detectedPatterns: string[];
  probability?: number;
}

export type ViewState = 'dashboard' | 'transactions' | 'collaboration' | 'terminal';
