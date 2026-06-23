import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

// ── CONFIGURAÇÕES DOS BANCOS E APIS ─────────────────────────────────────────
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

// Função auxiliar para normalizar tickers fracionários na busca de logs
const normalizarTicker = (ticker) => {
  if (!ticker) return '';
  const t = ticker.toUpperCase().trim();
  return t.endsWith('F') && t.length > 5 ? t.slice(0, -1) : t;
};

export default function App() {
  // ── ESTADOS DA APLICAÇÃO ──────────────────────────────────────────────────
  const [tickets, setTickets] = useState([]);
  const [logsHistoricos, setLogsHistoricos] = useState([]);
  const [transacoes, setTransacoes] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [isCronRunning, setIsCronRunning] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('Nunca verificado');
  
  // Modal de Ticket
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalId, setModalId] = useState('');
  const [modalTicker, setModalTicker] = useState('');
  const [modalNome, setModalNome] = useState('');
  
  // Modal de Transações (Compra/Venda)
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txId, setTxId] = useState(''); 
  const [txTicker, setTxTicker] = useState('');
  const [txTipo, setTxTipo] = useState('COMPRA');
  const [txQuantidade, setTxQuantidade] = useState('');
  const [txPreco, setTxPreco] = useState('');
  const [txData, setTxData] = useState(new Date().toISOString().split('T')[0]);

  // Sugestões Brapi
  const [sugestoes, setSugestoes] = useState([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  
  // Filtros de Período
  const hojeStr = new Date().toISOString().split('T')[0];
  const [dataInicio, setDataInicio] = useState(hojeStr);
  const [dataFim, setDataFim] = useState(hojeStr);
  const [ativosSelecionados, setAtivosSelecionados] = useState([]); 
  
  // Notificações
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  // ── LEITURA COMPLETA DOS DADOS ────────────────────────────────────────────
  const carregarDados = async () => {
    setLoading(true);
    try {
      const resTickets = await fetch(`${SB_URL}/rest/v1/finance_tickets?order=ticker.asc`, { method: 'GET', headers: SB_HDR });
      if (!resTickets.ok) throw new Error('Erro ao carregar os tickets do banco.');
      const dataTickets = await resTickets.json();
      
      const resLogs = await fetch(`${SB_URL}/rest/v1/finance_price_logs?order=registrado_em.asc`, { method: 'GET', headers: SB_HDR });
      if (!resLogs.ok) throw new Error('Erro ao carregar os logs do banco.');
      const dataLogs = await resLogs.json();

      const resTx = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      if (!resTx.ok) throw new Error('Erro ao carregar transações.');
      const dataTx = await resTx.json();

      setTickets(dataTickets);
      setLogsHistoricos(dataLogs);
      setTransacoes(dataTx);
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
    const interval = setInterval(() => { executarCronVerificacao(); }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sugestão com Debounce
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
          const nomeCompleto = data.results[0].longName || data.results[0].shortName || 'Empresa Cadastrada';
          setModalNome(nomeCompleto);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoadingSugestoes(false); }
  };

  // Varredura Automática de Preços
  const executarCronVerificacao = async () => {
    let ticketsAlvo = tickets;
    if (ticketsAlvo.length === 0) return;
    setIsCronRunning(true);
    try {
      const listaTickers = ticketsAlvo.map(t => t.ticker.toUpperCase().trim()).join(',');
      const logsNovos = [];
      let precosMercado = {};

      try {
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
      } catch (error) { console.error(error); }

      for (const t of ticketsAlvo) {
        const tickerChave = t.ticker.toUpperCase().trim();
        const tickerNormalizado = normalizarTicker(tickerChave);
        let precoAtual = precosMercado[tickerChave] || precosMercado[tickerNormalizado];
        let statusLog = "Atualizado via API (Lote)";

        if (!precoAtual || isNaN(precoAtual)) {
          try {
            const resIndividual = await fetch(`https://brapi.dev/api/quote/${tickerNormalizado}?token=${BRAPI_TOKEN}`);
            if (resIndividual.ok) {
              const dadosIndiv = await resIndividual.json();
              if (dadosIndiv.results?.[0]?.regularMarketPrice) {
                precoAtual = parseFloat(dadosIndiv.results[0].regularMarketPrice);
                statusLog = "Atualizado via API (Individual)";
              }
            }
          } catch (e) { console.error(e); }
        }

        if (!precoAtual || isNaN(precoAtual)) {
          const logsDoAtivo = logsHistoricos.filter(l => normalizarTicker(l.ticker) === tickerNormalizado);
          precoAtual = logsDoAtivo[logsDoAtivo.length - 1] ? parseFloat(logsDoAtivo[logsDoAtivo.length - 1].preco) : 25.00;
          statusLog = "Preço Histórico Base (Fallback)";
        }

        logsNovos.push({
          ticker: tickerChave,
          preco: parseFloat(precoAtual.toFixed(2)),
          status: statusLog,
          registrado_em: new Date().toISOString()
        });
      }

      await fetch(`${SB_URL}/rest/v1/finance_price_logs`, { method: 'POST', headers: SB_HDR, body: JSON.stringify(logsNovos) });
      await carregarDados();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setIsCronRunning(false); }
  };

  // ── MOTOR MATEMÁTICO: RECALCULAR CONSOLIDADO DOS ATIVOS ─────────────────────
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
      body: JSON.stringify({
        quantidade: totalQtd,
        preco_custo: parseFloat(precoMedioFinal.toFixed(4))
      })
    });
  };

  // ── OPERAÇÕES DO HISTÓRICO FINANCEIRO ───────────────────────────────────────
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

    if (!tkr || isNaN(qty) || qty <= 0 || isNaN(prc) || prc <= 0) {
      alert('Dados de lançamento inválidos.');
      return;
    }

    try {
      if (txId) {
        const res = await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${txId}`, {
          method: 'PATCH',
          headers: SB_HDR,
          body: JSON.stringify({ ticker: tkr, tipo: txTipo, quantidade: qty, preco: prc, registrado_em: dataIso })
        });
        if (!res.ok) throw new Error('Não foi possível alterar o registro.');
        showToast('Lançamento corrigido!');
      } else {
        const res = await fetch(`${SB_URL}/rest/v1/finance_transactions`, {
          method: 'POST',
          headers: SB_HDR,
          body: JSON.stringify({ ticker: tkr, tipo: txTipo, quantidade: qty, preco: prc, registrado_em: dataIso })
        });
        if (!res.ok) throw new Error('Falha ao registrar movimentação.');
        showToast('Nova ordem financeira executada.');
      }

      setIsTxModalOpen(false);
      
      const resRefetch = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      const novasTx = await resRefetch.json();
      
      await sincronizarPosicaoAtivo(tkr, novasTx);
      await carregarDados();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTransacao = async (id, ticker) => {
    if (!confirm('Deseja deletar permanentemente este lançamento? O preço médio e as cotas serão recalculados automaticamente.')) return;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      if (!res.ok) throw new Error('Erro ao apagar ordem.');
      
      showToast('Lançamento excluído.');
      
      const resRefetch = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      const novasTx = await resRefetch.json();
      
      await sincronizarPosicaoAtivo(ticker, novasTx);
      await carregarDados();
    } catch (e) { showToast(e.message, 'error'); }
  };

  const salvarTicket = async (e) => {
    e.preventDefault();
    if (!modalTicker.trim() || !modalNome.trim()) return;
    try {
      if (modalId) {
        await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, { method: 'PATCH', headers: SB_HDR, body: JSON.stringify({ nome: modalNome }) });
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_tickets`, { method: 'POST', headers: SB_HDR, body: JSON.stringify({ ticker: modalTicker.trim().toUpperCase(), nome: modalNome, quantidade: 0, preco_custo: 0 }) });
      }
      setIsModalOpen(false);
      await carregarDados();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTicket = async (id, ticker) => {
    if (!confirm(`Remover painel de ${ticker}?`)) return;
    await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
    await carregarDados();
  };

  // Gráficos
  const prepararGraficoPizza = () => {
    const ativosComSaldo = tickets.filter(t => parseInt(t.quantidade || 0) > 0);
    const labels = ativosComSaldo.map(t => t.ticker.toUpperCase());
    const dataValores = ativosComSaldo.map(t => {
      const tkNorm = normalizarTicker(t.ticker);
      const logs = logsHistoricos.filter(l => normalizarTicker(l.ticker) === tkNorm);
      const pMercado = logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : parseFloat(t.preco_custo || 0);
      return parseInt(t.quantidade) * pMercado; // Corrigido erro de atribuição inválida aqui
    });
    const cores = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
    return { labels, datasets: [{ data: dataValores, backgroundColor: cores.slice(0, labels.length), borderWidth: 1, borderColor: '#1e293b' }] };
  };

  const prepararDadosGraficoLinha = () => {
    const todosOsHorarios = [...new Set(logsFinaisExibição.map(l => {
      const dataObj = new Date(l.registrado_em);
      return `${dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }))];
    const tickersParaPlotar = ativosSelecionados.length > 0 ? ativosSelecionados : [...new Set(logsFinaisExibição.map(l => l.ticker.toUpperCase()))];
    const cores = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
    const datasets = tickersParaPlotar.map((ticker, index) => ({
      label: ticker,
      data: logsFinaisExibição.filter(l => l.ticker.toUpperCase() === ticker).map(l => parseFloat(l.preco)),
      borderColor: cores[index % cores.length],
      borderWidth: 2,
      tension: 0.1,
      fill: false
    }));
    return { labels: todosOsHorarios, datasets };
  };

  const logsFiltradosPorPeriodo = logsHistoricos.filter(log => {
    const d = log.registrado_em.split('T')[0];
    return d >= dataInicio && d <= dataFim;
  });

  const logsFinaisExibição = logsFiltradosPorPeriodo.filter(log => 
    ativosSelecionados.length === 0 || ativosSelecionados.includes(log.ticker.toUpperCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans antialiased">
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 flex items-center p-4 rounded-xl bg-slate-900 border border-emerald-800 text-emerald-200 text-xs shadow-2xl">
          <span className="mr-2">✨</span> {toast.message}
        </div>
      )}

      {/* INTERFACE SUPERIOR */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">QuantumFinance Hub</h1>
          <p className="text-xs text-slate-400 mt-0.5">Gestor Inteligente de Portfólio com Extrato Auditável</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={() => abrirModalTransacao()} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded-xl shadow-lg">💸 Registrar Ordem</button>
          <button onClick={() => { setModalId(''); setModalTicker(''); setModalNome(''); setIsModalOpen(true); }} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-xl shadow-lg">➕ Novo Ticker</button>
          <button onClick={executarCronVerificacao} disabled={isCronRunning} className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 rounded-xl">↻ Preços</button>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      <main className="max-w-7xl mx-auto space-y-6">
        
        {/* CARDS + PIZZA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Posição Consolidada</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tickets.map(t => {
                const tkNorm = normalizarTicker(t.ticker);
                const logs = logsHistoricos.filter(l => normalizarTicker(l.ticker) === tkNorm);
                const precoMercado = logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : 0;
                const qtdVal = parseInt(t.quantidade || 0);

                return (
                  <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-lg font-black text-blue-400 tracking-wider">{t.ticker.toUpperCase()}</span>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{t.nome}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => abrirModalTransacao('', t.ticker)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold rounded-lg text-emerald-400">💵 Lançar</button>
                        <button onClick={() => excluirTicket(t.id, t.ticker)} className="text-slate-500 hover:text-red-400 p-1 text-xs">✕</button>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex justify-between items-baseline">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Cotas / P. Médio</span>
                        <span className="text-xs font-mono font-bold text-slate-200">{qtdVal} un. • R$ {parseFloat(t.preco_custo || 0).toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase block">Patrimônio</span>
                        <span className="text-sm font-black text-white font-mono">R$ {(qtdVal * precoMercado).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Alocação de Carteira</h2>
            <div className="h-48 flex items-center justify-center my-2">
              {tickets.some(t => parseInt(t.quantidade || 0) > 0) ? (
                <Doughnut data={prepararGraficoPizza()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 } } } } }} />
              ) : (
                <span className="text-xs text-slate-600 border border-dashed border-slate-800 p-6 rounded-xl text-center">Nenhum saldo para gerar pizza patrimonial.</span>
              )}
            </div>
          </div>
        </div>

        {/* GRÁFICO HISTÓRICO */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-sm font-bold text-slate-200">🎛️ Flutuação de Mercado por Período</h3>
            <div className="flex items-center gap-2">
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono" />
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono" />
            </div>
          </div>
          <div className="h-64 w-full">
            {logsFinaisExibição.length > 0 ? <Line data={prepararDadosGraficoLinha()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { grid: { color: '#1e293b' } }, y: { grid: { color: '#1e293b' } } } }} /> : <div className="h-full flex items-center justify-center text-xs text-slate-600">Sem logs de pregão para a janela temporal selecionada.</div>}
          </div>
        </section>

        {/* EXTRATO INTEGRAL DE MOVIMENTAÇÕES */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-4 bg-slate-900/50 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-200">📋 Livro de Registro e Extrato de Ordens</h3>
            <p className="text-[11px] text-slate-400">Histórico completo e auditável das suas movimentações financeiras de investimentos.</p>
          </div>

          <div className="overflow-x-auto max-h-72">
            {!transacoes || transacoes.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">Nenhum lançamento financeiro cadastrado no histórico.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-3">Data Operação</th>
                    <th className="p-3">Ativo</th>
                    <th className="p-3">Operação</th>
                    <th className="p-3">Qtd. Cotas</th>
                    <th className="p-3">Preço Unitário</th>
                    <th className="p-3">Volume Total</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {transacoes.map((tx) => {
                    const totalVolume = parseInt(tx.quantidade || 0) * parseFloat(tx.preco || 0);
                    const isCompra = tx.tipo === 'COMPRA';
                    const dataFormatada = tx.registrado_em ? new Date(tx.registrado_em).toLocaleDateString('pt-BR') : 'Sem data';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="p-3 text-slate-400 font-mono">{dataFormatada}</td>
                        <td className="p-3 font-bold text-blue-400 tracking-wider">{tx.ticker ? tx.ticker.toUpperCase() : ''}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${isCompra ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-red-950 text-red-400 border border-red-900'}`}>
                            {isCompra ? '🛒 COMPRA' : '💰 VENDA'}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-semibold text-slate-300">{tx.quantidade} un</td>
                        <td className="p-3 font-mono text-slate-300">R$ {parseFloat(tx.preco || 0).toFixed(2)}</td>
                        <td className="p-3 font-mono font-bold text-white">R$ {totalVolume.toFixed(2)}</td>
                        <td className="p-3 text-center flex items-center justify-center gap-4">
                          <button onClick={() => abrirModalTransacao(tx.id)} className="text-slate-400 hover:text-blue-400 transition-colors p-1" title="Editar ordem">✏️ Ajustar</button>
                          <button onClick={() => excluirTransacao(tx.id, tx.ticker)} className="text-slate-500 hover:text-red-400 transition-colors p-1" title="Remover ordem">✕ Excluir</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      {/* MODAL LANÇAR / EDITAR ORDEM */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-white mb-3">{txId ? '✏️ Ajustar Lançamento' : '💸 Registrar Nova Ordem'}</h3>
            <form onSubmit={salvarTransacao} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Data da Operação</label>
                <input type="date" value={txData} onChange={e => setTxData(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Escolha o Ativo</label>
                <select disabled={!!txId} value={txTicker} onChange={e => setTxTicker(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white">
                  {tickets.map(t => (
                    <option key={t.id} value={t.ticker.toUpperCase()}>{t.ticker.toUpperCase()} - {t.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Tipo da Operação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTxTipo('COMPRA')} className={`py-2 text-xs font-bold rounded-xl border ${txTipo === 'COMPRA' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>🛒 Compra</button>
                  <button type="button" onClick={() => setTxTipo('VENDA')} className={`py-2 text-xs font-bold rounded-xl border ${txTipo === 'VENDA' ? 'bg-red-950/40 text-red-400 border-red-500' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>💰 Venda</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Quantidade</label>
                  <input type="number" placeholder="Ex: 10" value={txQuantidade} onChange={e => setTxQuantidade(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Preço Unitário (R$)</label>
                  <input type="number" step="0.01" placeholder="Ex: 15.30" value={txPreco} onChange={e => setTxPreco(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsTxModalOpen(false)} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl">Efetivar Lançamento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TICKER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-white mb-3">➕ Novo Ticker</h3>
            <form onSubmit={salvarTicket} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Código (Ticker)</label>
                <input type="text" placeholder="Ex: PETR4" value={modalTicker} onChange={e => setModalTicker(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white uppercase" />
                {sugestoes.length > 0 && (
                  <div className="absolute bg-slate-950 border border-slate-800 rounded-xl mt-1 w-72 max-h-36 overflow-y-auto z-50 text-xs">
                    {sugestoes.map((s, idx) => (
                      <button key={idx} type="button" onClick={() => selecionarSugestao(s.stock || s)} className="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 font-mono">{String(s.stock || s).toUpperCase()}</button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nome da Empresa</label>
                <input type="text" placeholder="Razão social" value={modalNome} onChange={e => setModalNome(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white" />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
