
import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldAlert, 
  LayoutDashboard, 
  Database, 
  Users, 
  TrendingUp, 
  ShieldCheck,
  AlertTriangle,
  History,
  Lock,
  PlusCircle,
  EyeOff,
  Terminal,
  Server,
  Activity
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { BankStats, ViewState, Transaction, AnalysisResponse } from './types';
import { analyzeFederatedData, predictFraudProbability } from './services/geminiService';
import { encryptValue, splitIntoShares, reconstructFromShares } from './utils/crypto';

export default function App() {
  const [activeView, setActiveView] = useState<ViewState>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(["[SYSTEM] Initialized secure computation environment..."]);
  
  // Form State
  const [amount, setAmount] = useState<string>('');
  const [riskScore, setRiskScore] = useState<number>(15);

  const addLog = (msg: string) => {
    setTerminalLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isProcessing) return;

    setIsProcessing(true);
    const amtNum = parseFloat(amount);
    
    addLog(`INITIATING TRANSACTION: $${amtNum}`);
    
    // 1. Blinding & Encryption (Frontend/Client Side)
    addLog("PHASE 1: Client-side blinding...");
    const encryptedAmt = encryptValue(amtNum);
    const shares = splitIntoShares(amtNum, 3);
    addLog(`ENCRYPTED PACKET GENERATED: ${encryptedAmt.substring(0, 15)}...`);
    addLog(`SMPC SHARES DISTRIBUTED TO 3 NODES: [${shares.map(s => s.partyId).join(', ')}]`);

    // 2. Simulated Transmission & Secure Reconstruction (Secure Zone)
    addLog("PHASE 2: Transmitting shares via encrypted tunnel...");
    await new Promise(r => setTimeout(r, 1000));
    const reconstructed = reconstructFromShares(shares);
    addLog("PHASE 3: Secure Multi-Party Aggregation complete. Passing features to ML engine.");

    // 3. ML Prediction (Insecure/Analysis Zone but using privacy data)
    try {
      const prediction = await predictFraudProbability(reconstructed, riskScore);
      addLog(`ML INFERENCE RESULT: ${prediction.isFraud ? 'FRAUD DETECTED' : 'NORMAL'} (${(prediction.probability * 100).toFixed(1)}%)`);

      const newTx: Transaction = {
        id: `TX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        timestamp: Date.now(),
        amount: amtNum,
        deviceRiskScore: riskScore,
        location: 'Remote API',
        isFraud: prediction.isFraud,
        probability: prediction.probability,
        status: 'Completed'
      };

      setTransactions([newTx, ...transactions]);
      setAmount('');
      setActiveView('transactions');
    } catch (error) {
      addLog("ERROR: Analysis node timeout.");
    } finally {
      setIsProcessing(false);
    }
  };

  const stats = useMemo(() => {
    const fraudCount = transactions.filter(t => t.isFraud).length;
    const normalCount = transactions.length - fraudCount;
    return [
      { name: 'Fraud', value: fraudCount, color: '#ef4444' },
      { name: 'Normal', value: normalCount, color: '#10b981' },
    ];
  }, [transactions]);

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      {/* Sidebar */}
      <nav className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <ShieldAlert size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">SENTINEL v2</h1>
        </div>

        <div className="flex-1 space-y-2">
          <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} />
          <NavItem icon={<History size={20} />} label="Transactions" active={activeView === 'transactions'} onClick={() => setActiveView('transactions')} />
          <NavItem icon={<Terminal size={20} />} label="SMPC Logs" active={activeView === 'terminal'} onClick={() => setActiveView('terminal')} />
          <NavItem icon={<Users size={20} />} label="Nodes" active={activeView === 'collaboration'} onClick={() => setActiveView('collaboration')} />
        </div>

        <div className="mt-auto pt-6 border-t border-slate-800">
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
             <div className="flex items-center gap-2 text-xs text-indigo-400 font-bold mb-2 uppercase tracking-widest">
                <Lock size={12} /> Privacy Status
             </div>
             <p className="text-[10px] text-slate-400">Zero-Knowledge Proofs (ZKP) and SMPC are active for all outbound traffic.</p>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight capitalize">{activeView}</h2>
            <p className="text-slate-400 mt-1">Advanced Multi-Party Fraud Analytics Engine</p>
          </div>
          <div className="flex gap-4">
             <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">API Status</span>
                <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1">
                   <Activity size={14} /> Operational
                </span>
             </div>
          </div>
        </header>

        {activeView === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Transaction Form */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                   <PlusCircle size={20} className="text-indigo-400" /> New Secured Transaction
                </h3>
                <form onSubmit={handleTransaction} className="space-y-4">
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-2 block tracking-wider">Transaction Amount ($)</label>
                      <input 
                        type="number" 
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-white font-mono text-lg"
                      />
                   </div>
                   <div>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-2 block tracking-wider">Device Risk Score (0-100)</label>
                      <input 
                        type="range" 
                        min="0" max="100"
                        value={riskScore}
                        onChange={e => setRiskScore(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                      <div className="flex justify-between mt-2 text-xs font-mono text-slate-400">
                         <span>Low Risk</span>
                         <span className="text-indigo-400 font-bold">{riskScore}%</span>
                         <span>Critical</span>
                      </div>
                   </div>
                   <button 
                     type="submit"
                     disabled={isProcessing}
                     className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 mt-4"
                   >
                     {isProcessing ? (
                       <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                     ) : (
                       <><Lock size={18} /> Encrypt & Process</>
                     )}
                   </button>
                </form>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 tracking-widest">Network Privacy Breakdown</h3>
                <div className="h-[200px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats} dataKey="value" innerRadius={60} outerRadius={80} paddingAngle={5}>
                          {stats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                      </PieChart>
                   </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-2">
                   {stats.map(s => (
                     <div key={s.name} className="flex items-center gap-2 text-xs font-semibold">
                        <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                        <span className="text-slate-300">{s.name}: {s.value}</span>
                     </div>
                   ))}
                </div>
              </div>
            </div>

            {/* Right: Charts and Visualizer */}
            <div className="lg:col-span-2 space-y-6">
               <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                     <EyeOff size={120} />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                       <Server size={20} className="text-indigo-400" /> SMPC Aggregator Status
                    </h3>
                    <p className="text-slate-400 text-sm mb-6 max-w-md">Real-time status of independent secure compute nodes participating in the network.</p>
                    
                    <div className="grid grid-cols-3 gap-4">
                       <NodeStatus party="Alpha-Node" status="Operational" latency="12ms" />
                       <NodeStatus party="Beta-Node" status="Operational" latency="24ms" />
                       <NodeStatus party="Gamma-Node" status="Operational" latency="18ms" />
                    </div>
                  </div>
               </div>

               <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-sm font-bold text-slate-500 uppercase mb-6 tracking-widest">Global Risk Distribution (Aggregated)</h3>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={MOCK_TIME_DATA}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="t" stroke="#475569" fontSize={12} />
                        <YAxis stroke="#475569" fontSize={12} />
                        <Tooltip />
                        <Area type="monotone" dataKey="risk" stroke="#6366f1" fill="rgba(99, 102, 241, 0.1)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeView === 'transactions' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
             <table className="w-full text-left border-collapse">
                <thead className="bg-slate-800/50">
                   <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">TX-ID</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Risk Score</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Prediction</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Probability</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                   {transactions.length === 0 ? (
                     <tr>
                        <td colSpan={6} className="px-6 py-20 text-center text-slate-500 italic">No transactions processed in this session.</td>
                     </tr>
                   ) : transactions.map(tx => (
                     <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-indigo-400">{tx.id}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-white">${tx.amount.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{tx.deviceRiskScore}%</td>
                        <td className="px-6 py-4">
                           <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${tx.isFraud ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                              {tx.isFraud ? 'Fraudulent' : 'Legitimate'}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono">{(tx.probability * 100).toFixed(1)}%</td>
                        <td className="px-6 py-4">
                           <div className="flex items-center gap-2 text-xs text-slate-500">
                              <ShieldCheck size={14} className="text-emerald-500" /> {tx.status}
                           </div>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
          </div>
        )}

        {activeView === 'terminal' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 font-mono text-sm h-[600px] overflow-y-auto flex flex-col-reverse shadow-inner">
             {terminalLogs.map((log, i) => (
               <div key={i} className={`mb-2 ${log.includes('ERROR') ? 'text-red-400' : log.includes('PHASE') ? 'text-indigo-400' : 'text-slate-400'}`}>
                 <span className="opacity-50 mr-2">&gt;</span>{log}
               </div>
             ))}
          </div>
        )}

        {activeView === 'collaboration' && (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in zoom-in-95 duration-300">
              <NodeCard name="Alpha Node" type="Compute" region="US-East" />
              <NodeCard name="Beta Node" type="Verifier" region="EU-West" />
              <NodeCard name="Gamma Node" type="Storage" region="Asia-SE" />
              <div className="md:col-span-3 bg-slate-900/50 border border-slate-800 p-8 rounded-2xl text-center">
                 <Lock size={32} className="mx-auto text-indigo-400 mb-4" />
                 <h4 className="text-lg font-bold text-white mb-2">Protocol: Secure Multi-Party Computation</h4>
                 <p className="text-slate-400 max-w-2xl mx-auto">
                    The network uses additive secret sharing to decompose sensitive transaction fields into random fragments. No single node possesses sufficient information to reconstruct the original data, ensuring mathematical privacy even if multiple nodes are compromised.
                 </p>
              </div>
           </div>
        )}
      </main>
    </div>
  );
}

// Utility Components
function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
        active 
          ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20 shadow-inner' 
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-transparent'
      }`}
    >
      {icon}
      <span className="font-semibold text-sm">{label}</span>
    </button>
  );
}

function NodeStatus({ party, status, latency }: { party: string, status: string, latency: string }) {
  return (
    <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
       <div className="text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-tighter">{party}</div>
       <div className="flex items-center justify-between">
          <span className="text-xs text-white font-semibold">{status}</span>
          <span className="text-[10px] font-mono text-indigo-400">{latency}</span>
       </div>
       <div className="w-full h-1 bg-slate-800 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-indigo-500 w-full animate-pulse" />
       </div>
    </div>
  );
}

function NodeCard({ name, type, region }: { name: string, type: string, region: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:border-indigo-500/40 transition-all group">
       <div className="flex justify-between items-start mb-4">
          <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-400 group-hover:scale-110 transition-transform">
             <Server size={20} />
          </div>
          <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">Active</div>
       </div>
       <h4 className="font-bold text-white text-lg">{name}</h4>
       <div className="mt-4 space-y-2">
          <div className="flex justify-between text-xs">
             <span className="text-slate-500">Module</span>
             <span className="text-slate-300 font-semibold">{type}</span>
          </div>
          <div className="flex justify-between text-xs">
             <span className="text-slate-500">Region</span>
             <span className="text-slate-300 font-semibold">{region}</span>
          </div>
       </div>
    </div>
  );
}

const MOCK_TIME_DATA = [
  { t: '12:00', risk: 24 }, { t: '13:00', risk: 18 }, { t: '14:00', risk: 35 },
  { t: '15:00', risk: 42 }, { t: '16:00', risk: 12 }, { t: '17:00', risk: 65 },
  { t: '18:00', risk: 55 }, { t: '19:00', risk: 32 }, { t: '20:00', risk: 28 },
];
