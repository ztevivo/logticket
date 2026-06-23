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

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState('home');

  const [tickets, setTickets] = useState([]);
  const [logsHistoricos, setLogsHistoricos] = useState([]);
  const [transacoes, setTransacoes] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isCronRunning, setIsCronRunning] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('Nunca verificado');
  
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

  const [sugestoes, setSugestoes] = useState([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  
  const hojeStr = new Date().toISOString().split('T')[0];
  const [dataInicio, setDataInicio] = useState(hojeStr);
  const [dataFim, setDataFim] = useState(hojeStr);
  const [ativosSelecionados, setAtivosSelecionados] = useState([]); 
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const [setoresMeta, setSetoresMeta] = useState({});
  const [ativosMeta, setAtivosMeta] = useState({});
  const [novoSetorNome, setNovoSetorNome] = useState('');
  const [novoSetorMeta, setNovoSetorMeta] = useState('');

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
          arrS.forEach(s => { mapeamentoSetores[s.nome] = parseFloat(s.meta_percentual); });
        }
        
        const resA = await fetch(`${SB_URL}/rest/v1/finance_target_assets`, { method: 'GET', headers: SB_HDR });
        if (resA.ok) {
          const arrA = await resA.json();
          arrA.forEach(a => { 
            mapeamentoAtivos[a.ticker.toUpperCase()] = { 
              setor: a.setor_nome, 
              metaGrupo: parseFloat(a.meta_group_percentual || a.meta_grupo_percentual || 0) 
            }; 
          });
        }
      } catch (e) {
        console.warn("Tabelas de metas pendentes.");
      }

      setTickets(dataTickets || []);
      setLogsHistoricos(dataLogs || []);
      setTransacoes(dataTx || []);
      setSetoresMeta(mapeamentoSetores);
      setAtivosMeta(mapeamentoAtivos);
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      showToast("Erro de sincronização: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    if (modalId || !modalTicker.trim() || modalTicker.trim().length < 2) {
      setSugestoes([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setLoadingSugestoes(true);
      try {
        const query = modalTicker.trim().toUpperCase();
        const res = await fetch(`https://brapi.dev/api/available?search=${query}&token=${BRAPI_TOKEN}`);
        if (res.ok) {
          const dados = await res.json();
          if (dados.stocks) setSugestoes(dados.stocks.slice(0, 5));
        }
      } catch (error) { console.error(error); }
      finally { setLoadingSugestoes(false); }
    }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [modalTicker, modalId]);

  const selecionarSugestao = async (tickerSelecionado) => {
    const limpo = tickerSelecionado.toUpperCase().trim();
    setModalTicker(limpo);
    setSugestoes([]);
    setLoadingSugestoes(true);
    try {
      const res = await fetch(`https://brapi.dev/api/quote/${limpo}?token=${BRAPI_TOKEN}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results[0]) {
          const ativoObjeto = data.results[0];
          const nomeCompleto = ativoObjeto.longName || ativoObjeto.shortName || 'Empresa Cadastrada';
          
          // CORREÇÃO AQUI: Alterado de .industry para .sector que é retornado pela BRAPI
          const setorExtraido = ativoObjeto.sector || 'Outros / Não Classificado';
          
          setModalNome(nomeCompleto);
          setModalSetorAuto(setorExtraido);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoadingSugestoes(false); }
  };

  const executarCronVerificacao = async () => {
    if (tickets.length === 0) return;
    setIsCronRunning(true);
    try {
      const listaTickers = tickets.map(t => t.ticker.toUpperCase().trim()).join(',');
      const logsNovos = [];
      let precosMercado = {};

      const resMercado = await fetch(`https://brapi.dev/api/quote/${listaTickers}?token=${BRAPI_TOKEN}`);
      if (resMercado.ok) {
        const dadosMercado = await resMercado.json();
        if (dadosMercado.results) {
          dadosMercado.results.forEach(ativo => {
            if (ativo.symbol && ativo.regularMarketPrice !== undefined) {
              precosMercado[ativo.symbol.toUpperCase().trim()] = parseFloat(ativo.regularMarketPrice);
            }
          });
        }
      }

      for (const t of tickets) {
        const tickerChave = t.ticker.toUpperCase().trim();
        let precoAtual = precosMercado[tickerChave] || t.preco_custo || 25.00;

        logsNovos.push({
          ticker: tickerChave,
          preco: parseFloat(parseFloat(precoAtual).toFixed(2)),
          status: "Atualização Automática de Portfólio",
          registrado_em: new Date().toISOString()
        });
      }

      await fetch(`${SB_URL}/rest/v1/finance_price_logs`, { method: 'POST', headers: SB_HDR, body: JSON.stringify(logsNovos) });
      await carregarDados();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setIsCronRunning(false); }
  };

  const sincronizarPosicaoAtivo = async (tickerParam, todasTransacoes) => {
    const tickerUpper = tickerParam.toUpperCase();
    const txsDoAtivo = todasTransacoes.filter(tx => tx.ticker.toUpperCase() === tickerUpper);
    const ativoFisico = tickets.find(t => t.ticker.toUpperCase() === tickerUpper);
    if (!ativoFisico) return;

    let totalQtd = 0;
    let totalCustoGlobal = 0;

    [...txsDoAtivo].sort((a, b) => new Date(a.registrado_em) - new Date(b.registrado_em)).forEach(tx => {
      const q = parseInt(tx.quantidade);
      const p = parseFloat(tx.preco);
      if (tx.tipo === 'COMPRA') {
        totalQtd += q;
        totalCustoGlobal += (q * p);
      } else {
        totalQtd = Math.max(0, totalQtd - q);
        if (totalQtd === 0) totalCustoGlobal = 0;
      }
    });

    const precoMedioFinal = totalQtd > 0 ? (totalCustoGlobal / totalQtd) : 0;

    await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${ativoFisico.id}`, {
      method: 'PATCH',
      headers: SB_HDR,
      body: JSON.stringify({ quantidade: totalQtd, preco_custo: parseFloat(precoMedioFinal.toFixed(4)) })
    });
  };

  const abrirModalTransacao = (idOrdem = '', tickerPredefinido = '') => {
    if (idOrdem) {
      const txExistente = transacoes.find(t => t.id === idOrdem);
      setTxId(txExistente.id);
      setTxTicker(txExistente.ticker.toUpperCase());
      setTxTipo(txExistente.tipo);
      setTxQuantidade(txExistente.quantidade);
      setTxPreco(txExistente.preco);
      setTxData(txExistente.registrado_em ? txExistente.registrado_em.split('T')[0] : new Date().toISOString().split('T')[0]);
    } else {
      setTxId('');
      setTxTicker(tickerPredefinido || (tickets[0]?.ticker || ''));
      setTxTipo('COMPRA');
      setTxQuantidade('');
      setTxPreco('');
      setTxData(new Date().toISOString().split('T')[0]);
    }
    setIsTxModalOpen(true);
  };

  const salvarTransacao = async (e) => {
    e.preventDefault();
    const qty = parseInt(txQuantidade);
    const prc = parseFloat(txPreco);
    const tkr = txTicker.toUpperCase();
    const dataIso = new Date(txData + 'T12:00:00').toISOString();

    try {
      if (txId) {
        await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${txId}`, {
          method: 'PATCH',
          headers: SB_HDR,
          body: JSON.stringify({ ticker: tkr, tipo: txTipo, quantidade: qty, preco: prc, registrado_em: dataIso })
        });
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_transactions`, {
          method: 'POST',
          headers: SB_HDR,
          body: JSON.stringify({ ticker: tkr, tipo: txTipo, quantidade: qty, preco: prc, registrado_em: dataIso })
        });
      }

      setIsTxModalOpen(false);
      const resRefetch = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      const novasTx = await resRefetch.json();
      
      await sincronizarPosicaoAtivo(tkr, novasTx);
      await carregarDados();
      showToast('Ordem processada!');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTransacao = async (id, ticker) => {
    if (!confirm('Deseja deletar este lançamento?')) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      const resRefetch = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      const novasTx = await resRefetch.json();
      await sincronizarPosicaoAtivo(ticker, novasTx);
      await carregarDados();
      showToast('Lançamento removido.');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const salvarTicket = async (e) => {
    e.preventDefault();
    if (!modalTicker.trim() || !modalNome.trim()) return;
    const tkrChave = modalTicker.trim().toUpperCase();
    const setorDefinido = modalSetorAuto || 'Outros / Não Classificado';

    try {
      if (modalId) {
        await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, { method: 'PATCH', headers: SB_HDR, body: JSON.stringify({ nome: modalNome }) });
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_tickets`, { 
          method: 'POST', 
          headers: SB_HDR, 
          body: JSON.stringify({ ticker: tkrChave, nome: modalNome, quantidade: 0, preco_custo: 0 }) 
        });

        await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
          method: 'POST',
          headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({ nome: setorDefinido, meta_percentual: 0 })
        });

        await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
          method: 'POST',
          headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({ ticker: tkrChave, setor_nome: setorDefinido, meta_group_percentual: 100 })
        });
      }
      setIsModalOpen(false);
      await carregarDados();
      showToast(`Ticker ${tkrChave} cadastrado.`);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTicket = async (id, ticker) => {
    if (!confirm(`Remover painel de ${ticker}?`)) return;
    await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
    await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${ticker.toUpperCase()}`, { method: 'DELETE', headers: SB_HDR });
    await carregarDados();
  };

  const adicionarSetor = async (e) => {
    e.preventDefault();
    if (!novoSetorNome.trim() || !novoSetorMeta) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ nome: novoSetorNome.trim(), meta_percentual: parseFloat(novoSetorMeta) })
      });
      setNovoSetorNome('');
      setNovoSetorMeta('');
      await carregarDados();
      showToast('Setor integrado!');
    } catch (err) { console.error(err); }
  };

  const atualizarSetorMetaBD = async (setor, valor) => {
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors?nome=eq.${setor}`, {
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({ meta_percentual: parseFloat(valor) || 0 })
      });
      setSetoresMeta(p => ({ ...p, [setor]: parseFloat(valor) || 0 }));
    } catch (err) { console.error(err); }
  };

  const removerSetor = async (setor) => {
    if (!confirm(`Excluir setor "${setor}"?`)) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors?nome=eq.${setor}`, { method: 'DELETE', headers: SB_HDR });
      await carregarDados();
    } catch (e) { console.error(e); }
  };

  const vincularAtivoAoSetorBD = async (ticker, setor, metaGrupo) => {
    const tkr = ticker.toUpperCase();
    const mGrupo = parseFloat(metaGrupo) || 0;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ ticker: tkr, setor_nome: setor || null, meta_group_percentual: mGrupo })
      });
      await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkr}`, {
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({ setor_nome: setor || null, meta_group_percentual: mGrupo })
      });
      setAtivosMeta(p => ({ ...p, [tkr]: { setor, metaGrupo: mGrupo } }));
    } catch (e) { console.error(e); }
  };

  const alternarSelecaoAtivo = (ticker) => {
    const tkr = ticker.toUpperCase();
    if (ativosSelecionados.includes(tkr)) {
      setAtivosSelecionados(ativosSelecionados.filter(item => item !== tkr));
    } else {
      setAtivosSelecionados([...ativosSelecionados, tkr]);
    }
  };

  const totalPatrimonioReal = tickets.reduce((acc, t) => {
    const logs = logsHistoricos.filter(l => l.ticker.toUpperCase() === t.ticker.toUpperCase());
    const precoMercado = logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : parseFloat(t.preco_custo || 0);
    return acc + (parseInt(t.quantidade || 0) * precoMercado);
  }, 0);

  const prepararPizzaReal = () => {
    const ativosComSaldo = tickets.filter(t => parseInt(t.quantidade || 0) > 0);
    return {
      labels: ativosComSaldo.map(t => t.ticker.toUpperCase()),
      datasets: [{
        data: ativosComSaldo.map(t => {
          const logs = logsHistoricos.filter(l => l.ticker.toUpperCase() === t.ticker.toUpperCase());
          return parseInt(t.quantidade) * (logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : parseFloat(t.preco_custo || 0));
        }),
        backgroundColor: ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'],
        borderWidth: 1, borderColor: '#1e293b'
      }]
    };
  };

  const prepararPizzaMeta = () => {
    return {
      labels: Object.keys(setoresMeta),
      datasets: [{
        data: Object.values(setoresMeta),
        backgroundColor: ['#6366f1', '#14b8a6', '#f43f5e', '#eab308', '#a855f7', '#06b6d4'],
        borderWidth: 1, borderColor: '#1e293b'
      }]
    };
  };

  const opcoesPizzaPercentual = (titulo) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 } } },
      title: { display: true, text: titulo, color: '#f8fafc', font: { size: 12, weight: 'bold' } },
    }
  });

  const logsFinaisExibição = logsHistoricos.filter(log => {
    const d = log.registrado_em.split('T')[0];
    return d >= dataInicio && d <= dataFim && (ativosSelecionados.length === 0 || ativosSelecionados.includes(log.ticker.toUpperCase()));
  });

  const prepararDadosGraficoLinha = () => {
    const todosOsHorarios = [...new Set(logsFinaisExibição.map(l => {
      const d = new Date(l.registrado_em);
      return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }))];
    
    const tickersParaPlotar = ativosSelecionados.length > 0 ? ativosSelecionados : [...new Set(logsHistoricos.map(l => l.ticker.toUpperCase()))];
    
    return {
      labels: todosOsHorarios,
      datasets: tickersParaPlotar.map((ticker, idx) => {
        const logsDoAtivo = logsFinaisExibição.filter(l => l.ticker.toUpperCase() === ticker);
        return {
          label: ticker,
          data: logsDoAtivo.map(l => parseFloat(l.preco)),
          borderColor: ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'][idx % 7],
          borderWidth: 2, fill: false, tension: 0.1
        };
      }).filter(dataset => dataset.data.length > 0)
    };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans antialiased">
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #020617; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #334155; }
        .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>

      {toast.show && (
        <div className="fixed top-5 right-5 z-50 flex items-center p-4 rounded-xl bg-slate-900 border border-emerald-800 text-emerald-200 text-xs shadow-2xl">
          <span>✨</span> <span className="ml-2">{toast.message}</span>
        </div>
      )}

      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-900 pb-5">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">QuantumFinance Hub</h1>
          <p className="text-xs text-slate-400 mt-0.5">Gestão Automatizada de Portfólio Auditável</p>
          
          <div className="flex gap-2 mt-4 bg-slate-900/60 p-1 rounded-xl border border-slate-800 w-fit">
            <button onClick={() => setAbaAtiva('home')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${abaAtiva === 'home' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>📊 Painel Geral</button>
            <button onClick={() => setAbaAtiva('metas')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${abaAtiva === 'metas' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>⚙️ Configurar Metas & Setores</button>
          </div>
        </div>

        <div className="flex gap-3 w-full md:w-auto self-end md:self-auto">
          <button onClick={() => abrirModalTransacao()} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded-xl shadow-lg">💸 Registrar Ordem</button>
          <button onClick={() => { setModalId(''); setModalTicker(''); setModalNome(''); setModalSetorAuto(''); setIsModalOpen(true); }} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-xl shadow-lg">➕ Novo Ticker</button>
          <button onClick={executarCronVerificacao} disabled={isCronRunning} className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 rounded-xl">↻ Preços</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        {abaAtiva === 'home' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/40 p-5 rounded-2xl border border-slate-800/60">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-60">
                {Object.keys(setoresMeta).length > 0 ? <Doughnut data={prepararPizzaMeta()} options={opcoesPizzaPercentual('Alocação Objetiva / Meta (%)')} /> : <div className="text-xs text-slate-600 text-center pt-24">Configure as metas na aba superior.</div>}
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-60">
                {tickets.some(t => parseInt(t.quantidade || 0) > 0) ? <Doughnut data={prepararPizzaReal()} options={opcoesPizzaPercentual('Alocação Líquida Real (%)')} /> : <div className="text-xs text-slate-600 text-center pt-24">Lance compras no extrato para computar o real.</div>}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ativos & Desempenho Operacional</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tickets.map(t => {
                  const logs = logsHistoricos.filter(l => l.ticker.toUpperCase() === t.ticker.toUpperCase());
                  const precoMercado = logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : 0;
                  const qtdVal = parseInt(t.quantidade || 0);
                  const patrReal = qtdVal * precoMercado;
                  const pctReal = totalPatrimonioReal > 0 ? (patrReal / totalPatrimonioReal) * 100 : 0;

                  const mAtivo = ativosMeta[t.ticker.toUpperCase()];
                  const setorPai = mAtivo?.setor || 'Sem Setor';
                  const pctSetorAlvo = setoresMeta[setorPai] || 0;
                  const pctAlvoGlobal = (pctSetorAlvo * (mAtivo?.metaGrupo || 0)) / 100;

                  return (
                    <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-lg font-black text-blue-400 tracking-wider">{t.ticker.toUpperCase()}</span>
                            <p className="text-[11px] text-slate-400 line-clamp-1">{t.nome}</p>
                            <span className="text-[10px] px-2 py-0.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-md mt-1 inline-block font-medium">📁 {setorPai}</span>
                          </div>
                          <button onClick={() => excluirTicket(t.id, t.ticker)} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
                        </div>

                        <div className="mt-4">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-slate-400">Real: <strong>{pctReal.toFixed(1)}%</strong></span>
                            <span className="text-purple-400">Meta: <strong>{pctAlvoGlobal.toFixed(1)}%</strong></span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full transition-all" style={{ width: `${Math.min(pctReal, 100)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex justify-between items-baseline text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Posição</span>
                          <span className="font-mono text-slate-200">{qtdVal} un • R$ {parseFloat(t.preco_custo || 0).toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">Total</span>
                          <span className="font-black font-mono text-white">R$ {patrReal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">🎛️ Flutuação e Evolução Histórica</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Clique nos múltiplos ativos abaixo para comparar imediatamente seus desempenhos.</p>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300" />
                  <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800/60">
                <span className="text-[11px] font-bold text-slate-400 uppercase flex items-center mr-2">Comparar ativos:</span>
                {tickets.map(t => {
                  const ativoChave = t.ticker.toUpperCase();
                  const estaSelecionado = ativosSelecionados.includes(ativoChave);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => alternarSelecaoAtivo(ativoChave)}
                      className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
                        estaSelecionado 
                          ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm shadow-blue-500/10' 
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${estaSelecionado ? 'bg-blue-400' : 'bg-slate-600'}`}></span>
                      {ativoChave}
                    </button>
                  );
                })}
                {ativosSelecionados.length > 0 && (
                  <button onClick={() => setAtivosSelecionados([])} className="text-[11px] text-slate-500 hover:text-red-400 ml-auto font-medium transition-colors">Limpar Filtros ✕</button>
                )}
              </div>

              <div className="h-60 w-full">
                {logsFinaisExibição.length > 0 ? <Line data={prepararDadosGraficoLinha()} options={{ responsive: true, maintainAspectRatio: false }} /> : <div className="text-xs text-slate-600 text-center pt-24">Sem cotações registradas no período ou ativos selecionados.</div>}
              </div>
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 bg-slate-900/50 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-200">📋 Livro de Ordens e Movimentações Financeiras</h3>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
                      <th className="p-3">Data</th>
                      <th className="p-3">Ativo</th>
                      <th className="p-3">Ação</th>
                      <th className="p-3">Volume</th>
                      <th className="p-3">Custo Unitário</th>
                      <th className="p-3 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {transacoes.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-800/10">
                        <td className="p-3 font-mono text-slate-400">{new Date(tx.registrado_em).toLocaleDateString('pt-BR')}</td>
                        <td className="p-3 font-bold text-blue-400">{tx.ticker?.toUpperCase()}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${tx.tipo === 'COMPRA' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
                            {tx.tipo}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{tx.quantidade} un</td>
                        <td className="p-3 font-mono">R$ {parseFloat(tx.preco || 0).toFixed(2)}</td>
                        <td className="p-3 text-center flex items-center justify-center gap-4">
                          <button onClick={() => abrirModalTransacao(tx.id)} className="text-slate-400 hover:text-blue-400 font-medium transition-colors">✏️ Ajustar</button>
                          <button onClick={() => excluirTransacao(tx.id, tx.ticker)} className="text-slate-500 hover:text-red-400 transition-colors">✕ Deletar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {abaAtiva === 'metas' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-black text-white">⚙️ Painel de Metas & Peso da Carteira</h2>
              <p className="text-xs text-slate-400 mt-1">Defina a distribuição e o peso ideal de cada setor/ativo.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">1. Alocação por Setor</h3>
                  <p className="text-[11px] text-slate-500">Defina a porcentagem macro desejada por indústria.</p>
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {Object.entries(setoresMeta).map(([setor, pct]) => (
                    <div key={setor} className="flex items-center justify-between bg-slate-900 p-2 rounded-xl border border-slate-800">
                      <span className="text-xs font-bold text-slate-300">{setor}</span>
                      <div className="flex items-center gap-2">
                        <input type="number" value={pct} onChange={e => atualizarSetorMetaBD(setor, e.target.value)} className="w-16 px-2 py-1 bg-slate-950 text-xs font-mono rounded text-center border border-slate-800 text-purple-400 font-bold" />
                        <button onClick={() => removerSetor(setor)} className="text-slate-500 hover:text-red-400 text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={adicionarSetor} className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
                  <input type="text" placeholder="Setor..." value={novoSetorNome} onChange={e => setNovoSetorNome(e.target.value)} className="col-span-2 px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white" />
                  <input type="number" placeholder="%" value={novoSetorMeta} onChange={e => setNovoSetorMeta(e.target.value)} className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-white" />
                  <button type="submit" className="col-span-3 py-1.5 bg-purple-900/40 hover:bg-purple-800 border border-purple-700/50 text-[11px] font-bold rounded-lg text-purple-200">➕ Inserir Novo Setor</button>
                </form>
              </div>

              <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400">2. Peso de Ativos no Grupo</h3>
                  <p className="text-[11px] text-slate-500">Mude a categoria ou o peso de distribuição interna do ativo.</p>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                  {tickets.map(t => {
                    const mAtivo = ativosMeta[t.ticker.toUpperCase()] || { setor: '', metaGrupo: 100 };
                    return (
                      <div key={t.id} className="grid grid-cols-3 gap-2 bg-slate-900 p-2 rounded-lg border border-slate-800 items-center text-xs">
                        <span className="font-mono font-bold text-blue-400">{t.ticker.toUpperCase()}</span>
                        <select value={mAtivo.setor || ''} onChange={e => vincularAtivoAoSetorBD(t.ticker, e.target.value, mAtivo.metaGrupo)} className="bg-slate-950 text-[11px] text-slate-300 border border-slate-800 rounded p-1">
                          <option value="">Sem Grupo</option>
                          {Object.keys(setoresMeta).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <input type="number" placeholder="Peso %" value={mAtivo.metaGrupo} onChange={e => vincularAtivoAoSetorBD(t.ticker, mAtivo.setor, e.target.value)} className="bg-slate-950 text-center font-mono text-[11px] border border-slate-800 rounded p-1 text-emerald-400 font-bold" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-white mb-1">➕ Cadastrar Novo Ticker</h3>
            <p className="text-[11px] text-slate-400 mb-4">O setor comercial será identificado e salvo de forma automática.</p>
            
            <form onSubmit={salvarTicket} className="space-y-4">
              <div className="relative">
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Código do Ticker (ex: VALE3)</label>
                <input type="text" placeholder="Ex: PETR4" value={modalTicker} onChange={e => setModalTicker(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs uppercase text-white font-mono" />
                {sugestoes.length > 0 && (
                  <div className="absolute bg-slate-950 border border-slate-800 rounded-xl mt-1 w-full max-h-36 overflow-y-auto z-50 text-xs">
                    {sugestoes.map((s, idx) => <button key={idx} type="button" onClick={() => selecionarSugestao(s.stock || s)} className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 font-mono text-blue-400">{String(s.stock || s).toUpperCase()}</button>)}
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Razão Social</label>
                <input type="text" placeholder="Nome comercial" value={modalNome} onChange={e => setModalNome(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white" />
              </div>

              {modalSetorAuto && (
                <div className="p-3 bg-blue-950/40 border border-blue-900/60 rounded-xl text-xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Setor Detectado Automaticamente:</span>
                  <span className="text-blue-300 font-semibold font-mono">⚡ {modalSetorAuto}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-800 text-xs rounded-xl">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-xs rounded-xl font-bold">Salvar Ativo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTxModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-white mb-3">{txId ? '✏️ Ajustar Ordem Existente' : '💸 Lançar Ordem de Mercado'}</h3>
            <form onSubmit={salvarTransacao} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Data</label>
                  <input type="date" value={txData} onChange={e => setTxData(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Ativo</label>
                  <select disabled={!!txId} value={txTicker} onChange={e => setTxTicker(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs disabled:opacity-50 text-white font-bold">
                    {tickets.map(t => <option key={t.id} value={t.ticker.toUpperCase()}>{t.ticker.toUpperCase()}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Direção</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTxTipo('COMPRA')} className={`py-2 text-xs font-bold rounded-xl border ${txTipo === 'COMPRA' ? 'bg-emerald-950 text-emerald-400 border-emerald-500' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>COMPRA</button>
                  <button type="button" onClick={() => setTxTipo('VENDA')} className={`py-2 text-xs font-bold rounded-xl border ${txTipo === 'VENDA' ? 'bg-red-950 text-red-400 border-red-500' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>VENDA</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Quantidade</label>
                  <input type="number" placeholder="Qtd" value={txQuantidade} onChange={e => setTxQuantidade(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Preço Custo</label>
                  <input type="number" step="0.01" placeholder="Preço" value={txPreco} onChange={e => setTxPreco(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsTxModalOpen(false)} className="px-4 py-2 bg-slate-800 text-xs rounded-xl">Fechar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-xs rounded-xl font-bold">Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
