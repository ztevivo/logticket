import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

// Registar componentes do Chart.js para o ecossistema React
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

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
  
  // Estados para o Modal de Cadastro/Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalId, setModalId] = useState('');
  const [modalTicker, setModalTicker] = useState('');
  const [modalNome, setModalNome] = useState('');
  
  // Estados para Sugestões da Brapi
  const [sugestoes, setSugestoes] = useState([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  
  // ── ESTADOS DE FILTRO POR PERÍODO (DATA INÍCIO E FIM) E COMPARAÇÃO ──────────
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

  // BLINDADO: Carregamento inicial e cronômetro de 15 min isolados com array [] vazio
  useEffect(() => {
    carregarDados();
    
    const interval = setInterval(() => {
      executarCronVerificacao();
    }, 15 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  // BLINDADO: Auto-sugestão com limite de caracteres e proteção Debounce aumentada para 600ms
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
        console.error("Erro ao buscar sugestões:", error);
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
      console.error("Erro ao buscar nome oficial do ativo:", e);
    } finally {
      setLoadingSugestoes(false);
    }
  };

  // ── REQUISIÇÃO MULTI-TICKET COM STRATEGY DE CORREÇÃO DE PREÇO (CXSE3, SAPR4) ─
  const executarCronVerificacao = async () => {
    // Busca o estado mais atualizado de tickets diretamente para a varredura
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
      } catch (error) {
        console.error("Erro na busca de cotações múltiplas:", error);
      }

      for (const t of ticketsAlvo) {
        const tickerChave = t.ticker.toUpperCase().trim();
        let precoAtual = precosMercado[tickerChave];
        let statusLog = "Atualizado via API (Lote)";

        // Fallback Secundário de Segurança se sumir do lote
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
          } catch (errInd) {
            console.error(`Erro no Fallback individual para ${tickerChave}:`, errInd);
          }
        }

        // Fallback Final Simulado estrito
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

      if (!resPost.ok) throw new Error('Não foi possível gravar os logs no Supabase.');
      showToast('Cotações sincronizadas com sucesso.', 'success');
      await carregarDados();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsCronRunning(false);
    }
  };

  // ── OPERAÇÕES CRUD ────────────────────────────────────────────────────────
  const abrirModalCadastro = () => {
    setModalId('');
    setModalTicker('');
    setModalNome('');
    setSugestoes([]);
    setIsModalOpen(true);
  };

  const abrirModalEdicao = (ticket) => {
    setModalId(ticket.id);
    setModalTicker(ticket.ticker.toUpperCase());
    setModalNome(ticket.nome);
    setSugestoes([]);
    setIsModalOpen(true);
  };

  const salvarTicket = async (e) => {
    e.preventDefault();
    if (!modalTicker.trim() || !modalNome.trim()) {
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    const upperTicker = modalTicker.trim().toUpperCase();

    try {
      if (modalId) {
        const res = await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, {
          method: 'PATCH',
          headers: SB_HDR,
          body: JSON.stringify({ nome: modalNome })
        });
        if (!res.ok) throw new Error('Falha ao atualizar dados do ativo.');
        showToast(`Ticket ${upperTicker} atualizado.`);
      } else {
        const res = await fetch(`${SB_URL}/rest/v1/finance_tickets`, {
          method: 'POST',
          headers: SB_HDR,
          body: JSON.stringify({ ticker: upperTicker, nome: modalNome })
        });
        if (!res.ok) throw new Error('Erro ao inserir ativo.');
        showToast(`Ticket ${upperTicker} adicionado.`);
      }

      setIsModalOpen(false);
      await carregarDados();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const excluirTicket = async (id, ticker) => {
    if (!confirm(`Deseja parar de monitorar o ativo ${ticker}?`)) return;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, {
        method: 'DELETE',
        headers: SB_HDR
      });
      if (!res.ok) throw new Error('Não foi possível remover o ativo.');
      showToast(`Ativo ${ticker} removido.`);
      await carregarDados();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── CONTROLADOR DE SELEÇÃO MULTIPLA ────────────────────────────────────────
  const alternarSelecaoAtivo = (ticker) => {
    const t = ticker.toUpperCase();
    if (ativosSelecionados.includes(t)) {
      setAtivosSelecionados(ativosSelecionados.filter(item => item !== t));
    } else {
      setAtivosSelecionados([...ativosSelecionados, t]);
    }
  };

  // ── FILTRAGEM POR PERÍODO DE DATA (INÍCIO E FIM) ───────────────────────────
  const logsFiltradosPorPeriodo = logsHistoricos.filter(log => {
    const dataLogStr = log.registrado_em.split('T')[0];
    return dataLogStr >= dataInicio && dataLogStr <= dataFim;
  });

  const logsFinaisExibição = logsFiltradosPorPeriodo.filter(log => {
    if (ativosSelecionados.length === 0) return true;
    return ativosSelecionados.includes(log.ticker.toUpperCase());
  });

  // ── PREPARAÇÃO DO GRÁFICO COMPARATIVO POR INTERVALO DE TEMPO ───────────────
  const prepararDadosGrafico = () => {
    const todosOsHorarios = [...new Set(logsFinaisExibição.map(l => {
      const dataObj = new Date(l.registrado_em);
      const d = dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const h = dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${d} ${h}`;
    }))];

    const tickersParaPlotar = ativosSelecionados.length > 0 
      ? ativosSelecionados 
      : [...new Set(logsFinaisExibição.map(l => l.ticker.toUpperCase()))];

    const coresPaleta = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

    const datasets = tickersParaPlotar.map((ticker, index) => {
      const logsDoAtivo = logsFinaisExibição.filter(l => l.ticker.toUpperCase() === ticker);
      const cor = coresPaleta[index % coresPaleta.length];

      return {
        label: ticker,
        data: logsDoAtivo.map(l => parseFloat(l.preco)),
        borderColor: cor,
        backgroundColor: cor + '04',
        borderWidth: 2,
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 5,
        fill: false,
      };
    });

    return { labels: todosOsHorarios, datasets };
  };

  const opcoesGrafico = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: '#9ca3af', font: { family: 'Inter', size: 12 } } },
      tooltip: { padding: 12, cornerRadius: 8 }
    },
    scales: {
      x: { grid: { color: '#1e293b', drawTicks: false }, ticks: { color: '#9ca3af', maxRotation: 45, size: 10 } },
      y: { grid: { color: '#1e293b', drawTicks: false }, ticks: { color: '#9ca3af', callback: v => 'R$ ' + v.toFixed(2) } }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased font-sans p-4 md:p-8">
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 flex items-center p-4 rounded-xl shadow-2xl border transition-all duration-300 ${
          toast.type === 'error' ? 'bg-red-950/90 border-red-800 text-red-200' : 'bg-slate-900/95 border-emerald-800 text-emerald-200'
        }`}>
          <span className="mr-2">{toast.type === 'error' ? '⚠️' : '✨'}</span>
          <p className="text-xs font-semibold">{toast.message}</p>
        </div>
      )}

      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              QuantumFinance Hub
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monitoramento Homologado • Último Check: <span className="text-slate-200 font-mono">{lastCheckTime}</span>
          </p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={abrirModalCadastro}
            className="flex-1 md:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-colors"
          >
            ➕ Adicionar Ticket
          </button>
          <button 
            onClick={executarCronVerificacao}
            disabled={isCronRunning}
            className="flex-1 md:flex-none px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
          >
            <span className={`${isCronRunning ? 'animate-spin' : ''}`}>↻</span>
            {isCronRunning ? 'Sincronizando...' : 'Forçar Varredura'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        {/* CARDS REAL-TIME */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Painel Atual de Ativos</h2>
          {tickets.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
              Nenhum ativo configurado.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tickets.map(t => {
                const logsDoAtivo = logsHistoricos.filter(l => l.ticker.toUpperCase() === t.ticker.toUpperCase());
                const ultimoLog = logsDoAtivo[logsDoAtivo.length - 1];
                const precoAtual = ultimoLog ? `R$ ${parseFloat(ultimoLog.preco).toFixed(2).replace('.', ',')}` : 'Buscando...';

                return (
                  <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold tracking-wider text-blue-400">{t.ticker.toUpperCase()}</h3>
                        <p className="text-xs text-slate-400 line-clamp-1">{t.nome}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => abrirModalEdicao(t)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors text-xs">✏️</button>
                        <button onClick={() => excluirTicket(t.id, t.ticker)} className="p-1.5 hover:bg-red-950/40 rounded-lg text-slate-400 hover:text-red-400 transition-colors text-xs">✕</button>
                      </div>
                    </div>
                    <div className="my-4">
                      <div className="text-2xl font-black tracking-tight text-white">{precoAtual}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* HISTÓRICO AVANÇADO POR INTERVALO TEMPORAL */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">🎛️ Comparador por Intervalo de Datas</h2>
              <p className="text-xs text-slate-400 mt-0.5">Selecione datas de início/fim e marque os ativos para cruzar dados e analisar tendências históricas completas.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Início:</span>
                <input 
                  type="date"
                  value={dataInicio}
                  onChange={e => setDataInicio(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">Fim:</span>
                <input 
                  type="date"
                  value={dataFim}
                  onChange={e => setDataFim(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-bold uppercase text-slate-400 mb-2">Selecione os ativos para comparar no gráfico:</span>
            <div className="flex flex-wrap gap-2">
              {tickets.map(t => {
                const ativoNome = t.ticker.toUpperCase();
                const selecionado = ativosSelecionados.includes(ativoNome);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => alternarSelecaoAtivo(ativoNome)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                      selecionado 
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500 shadow-md shadow-blue-500/10' 
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {selecionado ? '✓ ' : ''}{ativoNome}
                  </button>
                );
              })}
              {ativosSelecionados.length > 0 && (
                <button
                  onClick={() => setAtivosSelecionados([])}
                  className="px-3 py-1.5 text-xs font-bold text-red-400 bg-red-950/20 border border-red-900 rounded-xl hover:bg-red-950/40"
                >
                  Mostrar Todos
                </button>
              )}
            </div>
          </div>

          <div className="h-80 w-full pt-2">
            {logsFinaisExibição.length > 0 ? (
              <Line data={prepararDadosGrafico()} options={opcoesGrafico} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl p-8">
                <span>Nenhum log encontrado para o período selecionado.</span>
                <span className="text-[10px] mt-1 text-slate-600">Garanta que as datas coincidem com dias de pregão monitorados pelo app.</span>
              </div>
            )}
          </div>
        </section>

        {/* TABELA DE REGISTROS DO PERÍODO */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-200">📋 Amostras do Intervalo Temporal</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded-full">
              {logsFinaisExibição.length} logs listados
            </span>
          </div>

          <div className="overflow-x-auto max-h-80">
            {logsFinaisExibição.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">Sem registros correspondentes.</div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-medium">
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Data e Hora</th>
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Ativo</th>
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Cotação</th>
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Canal / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {[...logsFinaisExibição].reverse().slice(0, 100).map((log, i) => {
                    const statusNoChange = log.status.includes("Simulado");
                    return (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 text-slate-400 font-mono">
                          {new Date(log.registrado_em).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-4 font-bold text-blue-400">{log.ticker.toUpperCase()}</td>
                        <td className="p-4 font-mono font-medium text-white">R$ {parseFloat(log.preco).toFixed(2).replace('.', ',')}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                            statusNoChange ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-emerald-950/60 text-emerald-400 border-emerald-900'
                          }`}>
                            {log.status}
                          </span>
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

      {/* MODAL CADASTRO COM AUTOCOMPLETE BLINDADO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-visible">
            <h3 className="text-base font-bold text-white mb-4">
              {modalId ? '✏️ Ajustar Configurações' : '➕ Configurar Novo Ativo'}
            </h3>
            
            <form onSubmit={salvarTicket} className="space-y-4">
              <div className="relative">
                <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Código do Ativo (Ticker)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Ex: PETR4, SAPR4 ou CXSE3" 
                    disabled={!!modalId}
                    value={modalTicker}
                    onChange={e => setModalTicker(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 uppercase tracking-widest block"
                  />
                  {loadingSugestoes && (
                    <span className="absolute right-3 top-2.5 text-[10px] text-slate-500 animate-pulse">Buscando...</span>
                  )}
                </div>

                {sugestoes.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-800/50">
                    {sugestoes.map((item, index) => {
                      const tickerStr = typeof item === 'string' ? item : item.stock || item.symbol;
                      if (!tickerStr) return null;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => selecionarSugestao(tickerStr)}
                          className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex justify-between items-center"
                        >
                          <span className="font-bold text-blue-400 tracking-wider font-mono">{tickerStr.toUpperCase()}</span>
                          <span className="text-[10px] text-slate-500">Selecionar ativo ➔</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Nome da Empresa</label>
                <input 
                  type="text" 
                  placeholder="Selecione o código acima para preencher" 
                  value={modalNome}
                  onChange={e => setModalNome(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
