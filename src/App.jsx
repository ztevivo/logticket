import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

const SB_URL = 'https://gghwqnqxquhrxchimerw.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnaHdxbnF4cXVocnhjaGltZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzMxMjgsImV4cCI6MjA5NzcwOTEyOH0.mWAotOVvwVDL9gGnhbjn6asL7lWnrKpwc390nTf6RAc';
const BRAPI_TOKEN = 'ws5Toz7mQL85uqbuWcXTDo';

const SB_HDR = { 
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Prefer': 'return=representation' 
};

function InputMetaMecanismo({ nomeSetor, valorInicial, aoSalvar }) {
  const [valorLocal, setValorLocal] = useState(valorInicial);

  useEffect(() => {
    setValorLocal(valorInicial);
  }, [valorInicial]);

  const dispararMudanca = () => {
    const num = parseFloat(valorLocal) || 0;
    aoSalvar(nomeSetor, num);
  };

  return (
    <input 
      type="number" 
      value={valorLocal} 
      onChange={e => setValorLocal(e.target.value)}
      onBlur={dispararMudanca}
      onKeyDown={e => { if(e.key === 'Enter') dispararMudanca(); }}
      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-600 text-center" 
    />
  );
}

function InputPesoAtivoMecanismo({ ticker, setor, valorInicial, aoSalvar }) {
  const [valorLocal, setValorLocal] = useState(valorInicial);

  useEffect(() => {
    setValorLocal(valorInicial);
  }, [valorInicial]);

  const dispararMudanca = () => {
    const num = parseFloat(valorLocal) || 0;
    aoSalvar(ticker, setor, num);
  };

  return (
    <input 
      type="number" 
      value={valorLocal} 
      onChange={e => setValorLocal(e.target.value)}
      onBlur={dispararMudanca}
      onKeyDown={e => { if(e.key === 'Enter') dispararMudanca(); }}
      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none text-center"
    />
  );
}

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState('home');

  const [tickets, setTickets] = useState([]);
  const [logsHistoricos, setLogsHistoricos] = useState([]);
  const [transacoes, setTransacoes] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isCronRunning, setIsCronRunning] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalId, setModalId] = useState('');
  const [modalTicker, setModalTicker] = useState('');
  const [modalNome, setModalNome] = useState('');
  const [modalSetorAuto, setModalSetorAuto] = useState(''); 
  
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txId, setTxId] = useState(''); 
  const [txTicker, setTxTicker] = useState('');
  const [txTipo, setTxTipo] = useState('COMPRA');
  const [txQuantidade, setTxQuantidade] = useState('');
  const [txPreco, setTxPreco] = useState('');
  const [txData, setTxData] = useState(new Date().toISOString().split('T')[0]);

  const [ativosSelecionados, setAtivosSelecionados] = useState([]); 
  const hojeStr = new Date().toISOString().split('T')[0];
  const [dataInicio, setDataInicio] = useState(hojeStr);
  const [dataFim, setDataFim] = useState(hojeStr);
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const [setoresMeta, setSetoresMeta] = useState({});
  const [ativosMeta, setAtivosMeta] = useState({});
  const [alertasSistema, setAlertasSistema] = useState([]);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      const resTickets = await fetch(`${SB_URL}/rest/v1/finance_tickets?order=ticker.asc`, { method: 'GET', headers: SB_HDR });
      const dataTickets = await resTickets.json();
      
      const resLogs = await fetch(`${SB_URL}/rest/v1/finance_price_logs?order=registrado_em.asc`, { method: 'GET', headers: SB_HDR });
      const dataLogs = await resLogs.json();

      const resTx = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      const dataTx = await resTx.json();

      let mapeamentoSetores = {};
      let mapeamentoAtivos = {};
      
      try {
        const resS = await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, { method: 'GET', headers: SB_HDR });
        if (resS.ok) {
          const arrS = await resS.json();
          if (Array.isArray(arrS)) {
            arrS.forEach(s => { 
              if (s && s.nome) mapeamentoSetores[s.nome] = parseFloat(s.meta_percentual || 0); 
            });
          }
        }
      } catch (e) { console.error("Erro ao carregar setores:", e); }

      try {
        const resA = await fetch(`${SB_URL}/rest/v1/finance_target_assets`, { method: 'GET', headers: SB_HDR });
        if (resA.ok) {
          const arrA = await resA.json();
          if (Array.isArray(arrA)) {
            arrA.forEach(a => { 
              if (a && a.ticker) {
                mapeamentoAtivos[a.ticker.toUpperCase()] = { 
                  setor: a.setor_nome || 'Sem Setor', 
                  metaGrupo: parseFloat(a.meta_group_percentual || a.meta_grupo_percentual || 0) 
                };
              }
            });
          }
        }
      } catch (e) { console.error("Erro ao carregar metas de ativos:", e); }

      setTickets(Array.isArray(dataTickets) ? dataTickets : []);
      setLogsHistoricos(Array.isArray(dataLogs) ? dataLogs : []);
      setTransacoes(Array.isArray(dataTx) ? dataTx : []);
      
      setSetoresMeta(mapeamentoSetores);
      setAtivosMeta(mapeamentoAtivos);
    } catch (err) {
      console.error(err);
      showToast("Erro na sincronização: " + err.message, 'error');
    } disable {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    const novosAlertas = [];
    const totalSetores = Object.values(setoresMeta).reduce((acc, curr) => acc + curr, 0);
    
    if (totalSetores > 100) {
      novosAlertas.push(`⚠️ Alocação macro inválida: A soma das categorias é de ${totalSetores.toFixed(1)}%, ultrapassando o limite estrito de 100%.`);
    }

    Object.entries(setoresMeta).forEach(([nomeSetor, metaLimiteSetor]) => {
      let somaAtivosDoSetor = 0;
      Object
