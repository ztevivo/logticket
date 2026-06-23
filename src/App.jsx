import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

// Registrar componentes do Chart.js incluindo ArcElement para o gráfico de pizza
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

export default function App() {
  // ── ESTADOS DA APLICAÇÃO ──────────────────────────────────────────────────
  const [tickets, setTickets] = useState([]);
  const [logsHistoricos, setLogsHistoricos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isCronRunning, setIsCronRunning] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('Nunca verificado');
  
  // Estados para o Modal de Cadastro/Edição de Ticket
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalId, setModalId] = useState('');
  const [modalTicker, setModalTicker] = useState('');
  const [modalNome, setModalNome] = useState('');
  
  // Estados para o NOVO Modal de Compra e Venda
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txTicker, setTxTicker] = useState('');
  const [txTipo, setTxTipo] = useState('COMPRA'); // COMPRA ou VENDA
  const [txQuantidade, setTxQuantidade] = useState('');
  const [txPreco, setTxPreco] = useState('');

  // Estados para Sugestões da Brapi
  const [sugestoes, setSugestoes] = useState([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  
  // Estados para Filtro por Período
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

  // ── REQUISIÇÕES DE LEITURA (SUPABASE) ──────────────────────────────────────
  const carregarDados = async () => {
    setLoading(true);
    try {
      const resTickets = await fetch(`${SB_URL}/rest/v1/finance_tickets?order=ticker.asc`, { 
        method: 'GET',
        headers: SB_HDR 
      });
      if (!resTickets.ok) throw new Error('Erro ao carregar os tickets do banco.');
      const dataTickets = await resTickets.json();
      
      const resLogs = await fetch(`${SB_URL}/rest/v1/finance_price_logs?order=registrado_em.asc`, { 
        method: 'GET',
        headers: SB_HDR 
      });
      if (!resLogs.ok) throw new Error('Erro ao carregar os logs do banco.');
      const dataLogs = await resLogs.json();

      setTickets(dataTickets);
      setLogsHistoricos(dataLogs);
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Rodar apenas uma vez na montagem para evitar loops de requisição
  useEffect(() => {
    carregarDados();
    
    const interval = setInterval(() => {
      executarCronVerificacao();
    }, 15 * 60 * 1000);
    
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
          if (dados.stocks) {
            setSugestoes(dados.stocks.slice(0, 5));
          } else {
            setSugestoes([]);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingSugestoes(false);
      }
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSugestoes(false);
    }
  };

  // Varredura de Preços Otimizada
  const ejecutarCronVerificacao = async () => {
    let ticketsAlvo = tickets;
    if (ticketsAlvo.length === 0) {
      try {
        const res = await fetch(`${SB_URL}/rest/v1/finance_tickets`, { method: 'GET', headers: SB_HDR });
        if (res.ok) ticketsAlvo = await res.json();
      } catch (e) { console.error(e); }
    }
    
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
              if (ativo.symbol) {
                const sym = ativo.symbol.toUpperCase().trim();
                if (ativo.regularMarketPrice !== undefined && ativo.regularMarketPrice !== null) {
                  precosMercado[sym] = parseFloat(ativo.regularMarketPrice);
                }
              }
            });
          }
        }
      } catch (error) { console.error(error); }

      for (const t of ticketsAlvo) {
        const tickerChave = t.ticker.toUpperCase().trim();
        let precoAtual = precosMercado[tickerChave];
        let statusLog = "Atualizado via API (Lote)";

        if (!precoAtual || isNaN(precoAtual)) {
          try {
            const resIndividual = await fetch(`https://brapi.dev/api/quote/${tickerChave}?token=${BRAPI_TOKEN}`);
            if (resIndividual.ok) {
              const dadosIndiv = await resIndividual.json();
              if (dadosIndiv.results && dadosIndiv.results[0] && dadosIndiv.results[0].regularMarketPrice) {
                precoAtual = parseFloat(dadosIndiv.results[0].regularMarketPrice);
                statusLog = "Atualizado via API (Individual)";
              }
            }
          } catch (e) { console.error(e); }
        }

        if (!precoAtual || isNaN(precoAtual)) {
          const logsDoAtivo = logsHistoricos.filter(l => l.ticker.toUpperCase() === tickerChave);
          const ultimoLog = logsDoAtivo[logsDoAtivo.length - 1];
          const basePreco = ultimoLog ? parseFloat(ultimoLog.preco) : 25.00;
          precoAtual = parseFloat((basePreco + (Math.random() * 0.2 - 0.1)).toFixed(2));
          statusLog = "Ativo não encontrado (Simulado)";
        }

        logsNovos.push({
          ticker: tickerChave,
          preco: parseFloat(precoAtual.toFixed(2)),
          status: statusLog,
          registrado_em: new Date().toISOString()
        });
      }

      const resPost = await fetch(`${SB_URL}/rest/v1/finance_price_logs`, {
        method: 'POST',
        headers: SB_HDR,
        body: JSON.stringify(logsNovos)
      });

      if (!resPost.ok) throw new Error('Erro ao gravar logs.');
      showToast('Preços atualizados.');
      await carregarDados();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsCronRunning(false);
    }
  };

  // ── LÓGICA DE COMPRA E VENDA (PROCESSO FINANCEIRO) ─────────────────────────
  const abrirModalTransacao = (tickerOpcional = '') => {
    setTxTicker(tickerOpcional || (tickets[0]?.ticker || ''));
    setTxTipo('COMPRA');
    setTxQuantidade('');
    setTxPreco('');
    setIsTxModalOpen(true);
  };

  const executarTransacao = async (e) => {
    e.preventDefault();
    const qty = parseInt(txQuantidade);
    const prc = parseFloat(txPreco);

    if (!txTicker || isNaN(qty) || qty <= 0 || isNaN(prc) || prc <= 0) {
      alert('Insira valores válidos.');
      return;
    }

    const ativoAlvo = tickets.find(t => t.ticker.toUpperCase() === txTicker.toUpperCase());
    if (!ativoAlvo) return;

    let novaQtd = parseInt(ativoAlvo.quantidade || 0);
    let novoPrecoCusto = parseFloat(ativoAlvo.preco_custo || 0);

    if (txTipo === 'COMPRA') {
      const custoTotalAntigo = novaQtd * novoPrecoCusto;
      const custoTotalNovo = qty * prc;
      novaQtd += qty;
      novoPrecoCusto = novaQtd > 0 ? (custoTotalAntigo + custoTotalNovo) / novaQtd : 0;
    } else {
      if (qty > novaQtd) {
        alert(`Saldo insuficiente de ações para vender. Você possui apenas ${novaQtd} cotas.`);
        return;
      }
      novaQtd -= qty;
      if (novaQtd === 0) novoPrecoCusto = 0;
    }

    try {
      const res = await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${ativoAlvo.id}`, {
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({
          quantidade: novaQtd,
          preco_custo: parseFloat(novoPrecoCusto.toFixed(4))
        })
      });

      if (!res.ok) throw new Error('Erro ao salvar operação financeira.');
      showToast(`Movimentação de ${txTipo} registrada!`);
      setIsTxModalOpen(false);
      await carregarDados();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // CRUD Tickets Básicos
  const salvarTicket = async (e) => {
    e.preventDefault();
    if (!modalTicker.trim() || !modalNome.trim()) return;
    const upperTicker = modalTicker.trim().toUpperCase();

    try {
      if (modalId) {
        await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, {
          method: 'PATCH',
          headers: SB_HDR,
          body: JSON.stringify({ nome: modalNome })
        });
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_tickets`, {
          method: 'POST',
          headers: SB_HDR,
          body: JSON.stringify({ ticker: upperTicker, nome: modalNome, quantidade: 0, preco_custo: 0 })
        });
      }
      setIsModalOpen(false);
      await carregarDados();
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTicket = async (id, ticker) => {
    if (!confirm(`Excluir ativo ${ticker}?`)) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      await carregarDados();
    } catch (e) { console.error(e); }
  };

  const alternarSelecaoAtivo = (ticker) => {
    const t = ticker.toUpperCase();
    setAtivosSelecionados(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  // Filtros de Histórico
  const logsFiltradosPorPeriodo = logsHistoricos.filter(log => {
    const d = log.registrado_em.split('T')[0];
    return d >= dataInicio && d <= dataFim;
  });

  const logsFinaisExibição = logsFiltradosPorPeriodo.filter(log => 
    ativosSelecionados.length === 0 || ativosSelecionados.includes(log.ticker.toUpperCase())
  );

  // ── PREPARAÇÃO DO GRÁFICO DE PIZZA (PATRIMÔNIO ATUAL) ──────────────────────
  const prepararGraficoPizza = () => {
    const ativosComSaldo = tickets.filter(t => parseInt(t.quantidade || 0) > 0);
    const labels = ativosComSaldo.map(t => t.ticker.toUpperCase());
    
    const dataValores = ativosComSaldo.map(t => {
      const logsDoAtivo = logsHistoricos.filter(l => l.ticker.toUpperCase() === t.ticker.toUpperCase());
      const ultimoLog = logsDoAtivo[logsDoAtivo.length - 1];
      const precoMercado = ultimoLog ? parseFloat(ultimoLog.preco) : parseFloat(t.preco_custo || 0);
      return parseInt(t.quantidade) * precoMercado;
    });

    const coresPaleta = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

    return {
      labels,
      datasets: [{
        data: dataValores,
        backgroundColor: coresPaleta.slice(0, labels.length),
        borderWidth: 1,
        borderColor: '#1e293b'
      }]
    };
  };

  // Preparação de Gráfico de Linha
  const prepararDadosGraficoLinha = () => {
    const todosOsHorarios = [...new Set(logsFinaisExibição.map(l => {
      const dataObj = new Date(l.registrado_em);
      return `${dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }))];

    const tickersParaPlotar = ativosSelecionados.length > 0 ? ativosSelecionados : [...new Set(logsFinaisExibição.map(l => l.ticker.toUpperCase()))];
    const coresPaleta = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

    const datasets = tickersParaPlotar.map((ticker, index) => {
      const logsDoAtivo = logsFinaisExibição.filter(l => l.ticker.toUpperCase() === ticker);
      return {
        label: ticker,
        data: logsDoAtivo.map(l => parseFloat(l.preco)),
        borderColor: coresPaleta[index % coresPaleta.length],
        borderWidth: 2,
        tension: 0.1,
        fill: false
      };
    });

    return { labels: todosOsHorarios, datasets };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      
      {/* HEADER PRINCIPAL */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">QuantumFinance Hub</h1>
          <p className="text-xs text-slate-400 mt-0.5">Gestor de Ativos Integrado • Atualizações Automáticas Blindadas</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button onClick={() => abrirModalTransacao()} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded-xl shadow-lg">💸 Lançar Compra/Venda</button>
          <button onClick={() => { setModalId(''); setModalTicker(''); setModalNome(''); setIsModalOpen(true); }} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-bold rounded-xl shadow-lg">➕ Novo Ticker</button>
          <button onClick={ejecutarCronVerificacao} disabled={isCronRunning} className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 rounded-xl">↻ {isCronRunning ? 'Sincronizando' : 'Preços'}</button>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      <main className="max-w-7xl mx-auto space-y-6">
        
        {/* FILA SUPERIOR: CARDS ATIVOS + PIZZA DE PATRIMÔNIO */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CARDS DOS TICKERS (2 COLUNAS) */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Posição Atual do Portfólio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tickets.map(t => {
                const logsDoAtivo = logsHistoricos.filter(l => l.ticker.toUpperCase() === t.ticker.toUpperCase());
                const ultimoLog = logsDoAtivo[logsDoAtivo.length - 1];
                const precoMercado = ultimoLog ? parseFloat(ultimoLog.preco) : 0;
                const qtdVal = parseInt(t.quantidade || 0);
                const patrimonioTotal = qtdVal * precoMercado;

                return (
                  <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-lg font-black text-blue-400 tracking-wider">{t.ticker.toUpperCase()}</span>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{t.nome}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => abrirModalTransacao(t.ticker)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold rounded-lg text-emerald-400">💵 Movimentar</button>
                        <button onClick={() => excluirTicket(t.id, t.ticker)} className="text-slate-500 hover:text-red-400 p-1 text-xs">✕</button>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex justify-between items-baseline">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block">Cotas / P. Médio</span>
                        <span className="text-xs font-mono font-bold text-slate-200">{qtdVal} un. • R$ {parseFloat(t.preco_custo || 0).toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase block">Patrimônio Atual</span>
                        <span className="text-sm font-black text-white font-mono">R$ {patrimonioTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* NOVO: GRÁFICO DE PIZZA (1 COLUNA) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-2xl">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Divisão Patrimonial</h2>
              <p className="text-[11px] text-slate-500">Distribuição percentual financeira de acordo com a quantidade de ações compradas.</p>
            </div>
            <div className="h-48 flex items-center justify-center my-4">
              {tickets.some(t => parseInt(t.quantidade || 0) > 0) ? (
                <Doughnut data={prepararGraficoPizza()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 10 } } } } }} />
              ) : (
                <span className="text-xs text-slate-600 text-center border border-dashed border-slate-800 p-6 rounded-xl">Lance uma compra para desenhar o gráfico de alocação de ativos.</span>
              )}
            </div>
          </div>
        </div>

        {/* COMPARADOR POR INTERVALO DE DATAS (LINHA) */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-200">🎛️ Histórico Avançado por Período</h3>
              <p className="text-[11px] text-slate-400">Analise múltiplos dias e flutuações de mercado.</p>
            </div>
            <div className="flex items-center gap-3">
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono" />
              <span className="text-xs text-slate-600">Até</span>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono" />
            </div>
          </div>
          <div className="h-64 w-full">
            {logsFinaisExibição.length > 0 ? (
              <Line data={prepararDadosGraficoLinha()} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { grid: { color: '#1e293b' } }, y: { grid: { color: '#1e293b' } } } }} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-600">Nenhum log encontrado para o período especificado.</div>
            )}
          </div>
        </section>

      </main>

      {/* MODAL REGISTRAR COMPRA / VENDA */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-3">💸 Lançar Ordem de Compra / Venda</h3>
            <form onSubmit={executarTransacao} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Escolha o Ativo</label>
                <select value={txTicker} onChange={e => setTxTicker(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white">
                  {tickets.map(t => (
                    <option key={t.id} value={t.ticker.toUpperCase()}>{t.ticker.toUpperCase()} - {t.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Tipo da Operação</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTxTipo('COMPRA')} className={`py-2 text-xs font-bold rounded-xl border transition-all ${txTipo === 'COMPRA' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>🛒 Compra</button>
                  <button type="button" onClick={() => setTxTipo('VENDA')} className={`py-2 text-xs font-bold rounded-xl border transition-all ${txTipo === 'VENDA' ? 'bg-red-950/40 text-red-400 border-red-500' : 'bg-slate-950 text-slate-500 border-slate-800'}`}>💰 Venda</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Quantidade de Cotas</label>
                  <input type="number" placeholder="Ex: 10" value={txQuantidade} onChange={e => setTxQuantidade(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Preço Unitário (R$)</label>
                  <input type="number" step="0.01" placeholder="Ex: 14.50" value={txPreco} onChange={e => setTxPreco(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono" />
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

      {/* MODAL CONFIGURAR TICKER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-3">{modalId ? '✏️ Editar Ticket' : '➕ Novo Ticker'}</h3>
            <form onSubmit={salvarTicket} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Código (Ticker)</label>
                <input type="text" placeholder="Ex: PETR4" disabled={!!modalId} value={modalTicker} onChange={e => setModalTicker(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white uppercase tracking-widest" />
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
