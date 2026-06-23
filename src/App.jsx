import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement } from 'chart.js';
import { Line as LineChart, Doughnut as DoughnutChart } from 'react-react-chartjs-2';
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

// Componente auxiliar para evitar travamento de digitação nos inputs numéricos de Metas
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
    } finally {
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
      Object.entries(ativosMeta).forEach(([ticker, info]) => {
        if (info.setor === nomeSetor) {
          somaAtivosDoSetor += info.metaGrupo;
        }
      });

      if (somaAtivosDoSetor > 100) {
        novosAlertas.push(`🚨 Categoria Desbalanceada (${nomeSetor}): A soma dos pesos internos dos ativos está dando ${somaAtivosDoSetor}%, ultrapassando 100% internos.`);
      }
    });

    setAlertasSistema(novosAlertas);
  }, [setoresMeta, ativosMeta]);

  const buscarSetorFallbackViaLista = async (tickerLimpo) => {
    try {
      const res = await fetch(`https://brapi.dev/api/quote/list?search=${tickerLimpo}&token=${BRAPI_TOKEN}`);
      if (res.ok) {
        const dados = await res.json();
        if (dados && Array.isArray(dados.stocks)) {
          const match = dados.stocks.find(s => s && s.stock && s.stock.toUpperCase() === tickerLimpo.toUpperCase());
          if (match && match.sector) return match.sector;
        }
      }
    } catch (e) { console.error(e); }
    return '';
  };

  const inferirSetorPorSufixo = (tickerLimpo) => {
    const t = tickerLimpo.toUpperCase().trim();
    if (t.endsWith('11')) return 'Fundos Imobiliários';
    return 'Financeiro e Bancos';
  };

  const selecionarSugestao = async (tickerSelecionado) => {
    let limpo = tickerSelecionado.toUpperCase().trim();
    const tickerComSufixo = limpo.endsWith('.SA') ? limpo : `${limpo}.SA`;
    
    setModalTicker(limpo.replace('.SA', '')); 
    try {
      const res = await fetch(`https://brapi.dev/api/quote/${tickerComSufixo}?modules=summaryProfile&token=${BRAPI_TOKEN}`);
      let nomeCompleto = '';
      let setorExtraido = '';

      if (res.ok) {
        const data = await res.json();
        if (data && data.results && data.results[0]) {
          const ativoObjeto = data.results[0];
          nomeCompleto = ativoObjeto.longName || ativoObjeto.shortName || 'Empresa Cadastrada';
          setorExtraido = ativoObjeto.summaryProfile?.sector || ativoObjeto.sector || '';
        }
      }

      if (!setorExtraido) setorExtraido = await buscarSetorFallbackViaLista(limpo);
      if (!setorExtraido) setorExtraido = inferirSetorPorSufixo(limpo);

      if (nomeCompleto) setModalNome(nomeCompleto);
      setModalSetorAuto(setorExtraido);
    } catch (e) {
      setModalSetorAuto(inferirSetorPorSufixo(limpo));
    }
  };

  const abrirModalEditarTicket = async (id, ticker, nomeAtual) => {
    setModalId(id);
    setModalTicker(ticker.toUpperCase());
    setModalNome(nomeAtual);
    setModalSetorAuto('');
    setIsModalOpen(true);
    await selecionarSugestao(ticker);
  };

  const ejecutarCronVerificacao = async () => {
    if (!Array.isArray(tickets) || tickets.length === 0) return;
    setIsCronRunning(true);
    try {
      const listaTickers = tickets.map(t => {
        const tk = t.ticker.toUpperCase().trim();
        return tk.endsWith('.SA') ? tk : `${tk}.SA`;
      }).join(',');

      const logsNovos = [];
      let precosMercado = {};

      const resMercado = await fetch(`https://brapi.dev/api/quote/${listaTickers}?token=${BRAPI_TOKEN}`);
      if (resMercado.ok) {
        const dadosMercado = await resMercado.json();
        if (dadosMercado && dadosMercado.results) {
          dadosMercado.results.forEach(ativo => {
            if (ativo && ativo.symbol && ativo.regularMarketPrice !== undefined) {
              const chaveLimpa = ativo.symbol.toUpperCase().replace('.SA', '').trim();
              precosMercado[chaveLimpa] = parseFloat(ativo.regularMarketPrice);
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
    if (!Array.isArray(todasTransacoes)) return;
    const tickerUpper = tickerParam.toUpperCase();
    const txsDoAtivo = todasTransacoes.filter(tx => tx && tx.ticker && tx.ticker.toUpperCase() === tickerUpper);
    const ativoFisico = tickets.find(t => t && t.ticker && t.ticker.toUpperCase() === tickerUpper);
    if (!ativoFisico) return;

    let totalQtd = 0;
    let totalCustoGlobal = 0;

    [...txsDoAtivo].sort((a, b) => new Date(a.registrado_em) - new Date(b.registrado_em)).forEach(tx => {
      const q = parseInt(tx.quantidade || 0);
      const p = parseFloat(tx.preco || 0);
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
      if (!txExistente) return;
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
      showToast('Ordem processada com sucesso!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTransacao = async (id, ticker) => {
    if (!confirm('Deseja deletar este lançamento do extrato?')) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      const resRefetch = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      const novasTx = await resRefetch.json();
      await sincronizarPosicaoAtivo(ticker, novasTx);
      await carregarDados();
      showToast('Lançamento removido permanentemente.');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const persistirSetorAtivo = async (tkrChave, setorDefinido) => {
    // Garante que o setor pai exista
    await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
      method: 'POST',
      headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ nome: setorDefinido, meta_percentual: 0 })
    });

    // Insere ou atualiza o ativo vinculado a este setor de forma automática
    await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
      method: 'POST',
      headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ ticker: tkrChave, setor_nome: setorDefinido, meta_group_percentual: 0 })
    });

    await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkrChave}`, {
      method: 'PATCH',
      headers: SB_HDR,
      body: JSON.stringify({ setor_nome: setorDefinido })
    });
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
      }
      
      // PERSISTÊNCIA AUTOMÁTICA EM MAIS DE UMA TABELA (Resolve a sincronização automática no BD)
      await persistirSetorAtivo(tkrChave, setorDefinido);
      setIsModalOpen(false);
      await carregarDados();
      showToast(`Ticker ${tkrChave} sincronizado no hub.`, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTicket = async (id, ticker) => {
    const confirmacao = window.confirm(`⚠️ Deseja remover permanentemente o ativo ${ticker.toUpperCase()}?`);
    if (!confirmacao) return;

    try {
      await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${ticker.toUpperCase()}`, { method: 'DELETE', headers: SB_HDR });
      await carregarDados();
      showToast(`Ativo ${ticker.toUpperCase()} removido com sucesso.`);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const atualizarSetorMetaBD = async (setorAlterado, valorNumerico) => {
    const copiaSetores = { ...setoresMeta, [setorAlterado]: valorNumerico };
    const somaFutura = Object.values(copiaSetores).reduce((acc, curr) => acc + curr, 0);

    if (somaFutura > 100) {
      showToast(`Bloqueado: A soma dos setores não pode passar de 100% (Tentativa: ${somaFutura}%).`, 'error');
      return;
    }

    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors?nome=eq.${setorAlterado}`, {
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({ meta_percentual: valorNumerico })
      });
      setSetoresMeta(copiaSetores);
      showToast('Meta do setor salva.', 'success');
    } catch (err) { console.error(err); }
  };

  const vincularAtivoAoSetorBD = async (ticker, setor, metaGrupo) => {
    const tkr = ticker.toUpperCase();
    const mGrupo = parseFloat(metaGrupo) || 0;
    
    setAtivosMeta(p => ({
      ...p,
      [tkr]: { setor: setor || 'Sem Setor', metaGrupo: mGrupo }
    }));

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

  const totalPatrimonioReal = Array.isArray(tickets) ? tickets.reduce((acc, t) => {
    if (!t) return acc;
    const logs = Array.isArray(logsHistoricos) ? logsHistoricos.filter(l => l && l.ticker && l.ticker.toUpperCase() === t.ticker.toUpperCase()) : [];
    const precoMercado = logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : parseFloat(t.preco_custo || 0);
    return acc + (parseInt(t.quantidade || 0) * precoMercado);
  }, 0) : 0;

  const prepararPizzaReal = () => {
    const ativosComSaldo = Array.isArray(tickets) ? tickets.filter(t => t && parseInt(t.quantidade || 0) > 0) : [];
    return {
      labels: ativosComSaldo.map(t => t.ticker.toUpperCase()),
      datasets: [{
        data: ativosComSaldo.map(t => {
          const logs = Array.isArray(logsHistoricos) ? logsHistoricos.filter(l => l && l.ticker && l.ticker.toUpperCase() === t.ticker.toUpperCase()) : [];
          return parseInt(t.quantidade) * (logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : parseFloat(t.preco_custo || 0));
        }),
        backgroundColor: ['#3b82f6', '#10b981', '#f43f5e', '#eab308', '#8b5cf6', '#ec4899', '#14b8a6'],
        borderWidth: 0
      }]
    };
  };

  const prepararPizzaMeta = () => {
    return {
      labels: Object.keys(setoresMeta),
      datasets: [{
        data: Object.values(setoresMeta),
        backgroundColor: ['#6366f1', '#14b8a6', '#f43f5e', '#eab308', '#a855f7', '#06b6d4'],
        borderWidth: 0
      }]
    };
  };

  const opcoesPizzaPercentual = (titulo) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: 'bottom', 
        labels: { color: '#94a3b8', font: { size: 11, family: 'Plus Jakarta Sans', weight: '500' }, boxWidth: 12, padding: 15 } 
      },
      title: { display: true, text: titulo, color: '#f8fafc', font: { size: 14, family: 'Plus Jakarta Sans', weight: '700' }, padding: { bottom: 10 } },
    }
  });

  const logsFinaisExibição = Array.isArray(logsHistoricos) ? logsHistoricos.filter(log => {
    if (!log || !log.registrado_em) return false;
    const d = log.registrado_em.split('T')[0];
    return d >= dataInicio && d <= dataFim && (ativosSelecionados.length === 0 || ativosSelecionados.includes(log.ticker.toUpperCase()));
  }) : [];

  const prepararDadosGraficoLinha = () => {
    const todosOsHorarios = [...new Set(logsFinaisExibição.map(l => {
      const d = new Date(l.registrado_em);
      return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }))];
    
    const tickersParaPlotar = ativosSelecionados.length > 0 ? ativosSelecionados : [...new Set(logsHistoricos.map(l => l && l.ticker ? l.ticker.toUpperCase() : ''))].filter(Boolean);
    
    return {
      labels: todosOsHorarios,
      datasets: tickersParaPlotar.map((ticker, idx) => {
        const logsDoAtivo = logsFinaisExibição.filter(l => l && l.ticker && l.ticker.toUpperCase() === ticker);
        return {
          label: ticker,
          data: logsDoAtivo.map(l => parseFloat(l.preco || 0)),
          borderColor: ['#3b82f6', '#10b981', '#f43f5e', '#eab308', '#8b5cf6', '#ec4899', '#14b8a6'][idx % 7],
          borderWidth: 2, fill: false, tension: 0.2, pointRadius: 2
        };
      }).filter(dataset => dataset.data.length > 0)
    };
  };

  return (
    <div className="min-h-screen p-4 md:p-8 text-slate-200">
      
      {/* Toast Notifier */}
      {toast.show && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-slate-200 text-xs shadow-2xl shadow-black/50 animate-slide-up">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header Glassmorphism */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 bg-slate-900/40 backdrop-blur-md border border-slate-900 p-6 rounded-2xl shadow-xl shadow-black/20">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-600/10 border border-blue-500/20 rounded-xl text-blue-400">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 8H20M4 16H20M8 4V20M16 4V20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 12H18M12 6V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 2"/>
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
                LogTicket
              </h1>
              <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono px-1.5 py-0.5 rounded">v2.5</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">Gestão Automatizada de Portfólio Auditável</p>
            
            <div className="flex gap-1 mt-4 bg-slate-950 p-1 rounded-xl border border-slate-800/80 w-fit">
              <button 
                onClick={() => setAbaAtiva('home')} 
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${abaAtiva === 'home' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-900/20' : 'text-slate-400 hover:text-slate-200'}`}
              >
                📊 Painel Geral
              </button>
              <button 
                onClick={() => setAbaAtiva('metas')} 
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${abaAtiva === 'metas' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/20' : 'text-slate-400 hover:text-slate-200'}`}
              >
                ⚙️ Metas & Setores
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
          <button onClick={() => abrirModalTransacao()} className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-950/20 active:scale-[0.98]">
            💸 Registrar Ordem
          </button>
          <button onClick={() => { setModalId(''); setModalTicker(''); setModalNome(''); setModalSetorAuto(''); setIsModalOpen(true); }} className="flex-1 md:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-slate-100 font-bold text-xs rounded-xl transition-all shadow-lg active:scale-[0.98]">
            ➕ Novo Ticker
          </button>
          <button 
            onClick={ejecutarCronVerificacao} 
            disabled={isCronRunning} 
            className={`px-4 py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs font-bold font-mono text-slate-400 rounded-xl transition-all flex items-center gap-2 ${isCronRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-blue-400 ${isCronRunning ? 'animate-ping' : ''}`} />
            {isCronRunning ? 'Atualizando...' : '↻ Preços'}
          </button>
        </div>
      </header>

      {/* Main Content Arena */}
      <main className="max-w-7xl mx-auto space-y-8">
        {loading && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs font-mono text-blue-400 animate-pulse">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
            Sincronizando base de dados em nuvem em tempo real...
          </div>
        )}
        
        {abaAtiva === 'home' && (
          <>
            {/* Charts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-900/20 p-2 rounded-2xl border border-slate-900/60">
              <div className="bg-slate-900/60 border border-slate-900/80 backdrop-blur-sm rounded-2xl p-6 h-72 shadow-lg">
                {Object.keys(setoresMeta).length > 0 ? (
                  <DoughnutChart data={prepararPizzaMeta()} options={opcoesPizzaPercentual('Alocação por Categoria / Setores (%)')} />
                ) : (
                  <div className="text-xs text-slate-500 font-medium text-center pt-28">Configure as metas de categoria na aba superior.</div>
                )}
              </div>
              <div className="bg-slate-900/60 border border-slate-900/80 backdrop-blur-sm rounded-2xl p-6 h-72 shadow-lg">
                {tickets && tickets.some(t => t && parseInt(t.quantidade || 0) > 0) ? (
                  <DoughnutChart data={prepararPizzaReal()} options={opcoesPizzaPercentual('Alocação Líquida Real (%)')} />
                ) : (
                  <div className="text-xs text-slate-500 font-medium text-center pt-28">Lance compras no extrato para computar a distribuição real.</div>
                )}
              </div>
            </div>

            {/* Assets Grid */}
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Ativos & Desempenho Operacional</h2>
                <span className="text-xs text-slate-400 font-medium bg-slate-900/60 border border-slate-900 px-2.5 py-1 rounded-lg">
                  Patrimônio Combinado: <strong className="font-mono text-white ml-1">R$ {totalPatrimonioReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tickets.map(t => {
                  if (!t) return null;
                  const logs = Array.isArray(logsHistoricos) ? logsHistoricos.filter(l => l && l.ticker && l.ticker.toUpperCase() === t.ticker.toUpperCase()) : [];
                  const precoMercado = logs[logs.length - 1] ? parseFloat(logs[logs.length - 1].preco) : 0;
                  const qtdVal = parseInt(t.quantidade || 0);
                  const patrReal = qtdVal * precoMercado;
                  const pctReal = totalPatrimonioReal > 0 ? (patrReal / totalPatrimonioReal) * 100 : 0;

                  const mAtivo = ativosMeta[t.ticker.toUpperCase()];
                  const setorPai = mAtivo?.setor || 'Sem Setor';
                  const pctSetorAlvo = setoresMeta[setorPai] || 0;
                  const pctAlvoGlobal = (pctSetorAlvo * (mAtivo?.metaGrupo || 0)) / 100;

                  return (
                    <div key={t.id} className="bg-slate-900/40 backdrop-blur-sm border border-slate-900 rounded-2xl p-5 flex flex-col justify-between shadow-md hover:border-slate-800 transition-all hover:translate-y-[-1px]">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-lg font-black text-blue-400 tracking-wide font-mono">{t.ticker.toUpperCase()}</span>
                            <p className="text-xs text-slate-400 font-medium line-clamp-1 mt-0.5">{t.nome}</p>
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-md mt-2 inline-block font-medium">
                              📁 {setorPai}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => abrirModalEditarTicket(t.id, t.ticker, t.nome)} 
                              className="p-1.5 text-slate-500 hover:text-blue-400 text-xs transition-colors rounded-lg hover:bg-blue-500/10"
                            >
                              ⚙️
                            </button>
                            <button 
                              onClick={() => excluirTicket(t.id, t.ticker)} 
                              className="p-1.5 text-slate-600 hover:text-rose-400 text-sm transition-colors rounded-lg hover:bg-rose-500/5"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 bg-slate-950 p-2.5 rounded-xl border border-slate-900">
                          <div className="flex justify-between text-[11px] mb-1.5 font-medium">
                            <span className="text-slate-400">Atual: <strong className="font-mono text-blue-400">{pctReal.toFixed(1)}%</strong></span>
                            <span className="text-slate-400">Meta Global: <strong className="font-mono text-purple-400">{pctAlvoGlobal.toFixed(1)}%</strong></span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all" style={{ width: `${Math.min(pctReal, 100)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-900/80 flex justify-between items-end text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-wider">Custódia</span>
                          <span className="font-mono font-medium text-slate-300 mt-0.5 block">{qtdVal} un • R$ {parseFloat(t.preco_custo || 0).toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-wider">Valorização</span>
                          <span className="font-bold font-mono text-white text-sm mt-0.5 block">R$ {patrReal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Historical Analytics */}
            <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-900 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <span className="w-1.5 h-3 bg-blue-500 rounded-full" />
                    🎛️ Flutuação e Evolução Histórica
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Selecione e compare os ativos monitorados dinamicamente.</p>
                </div>
                <div className="flex gap-2 self-end sm:self-auto bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                  <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none" />
                  <span className="text-slate-600 self-center text-xs px-0.5">a</span>
                  <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none" />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 p-3 bg-slate-950 rounded-xl border border-slate-900">
                {tickets.map(t => {
                  if (!t) return null;
                  const ativoChave = t.ticker.toUpperCase();
                  const estaSelecionado = ativosSelecionados.includes(ativoChave);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => alternarSelecaoAtivo(ativoChave)}
                      className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${
                        estaSelecionado 
                          ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 shadow-inner' 
                          : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ativoChave}
                    </button>
                  );
                })}
              </div>

              <div className="h-72 w-full pt-2">
                {logsFinaisExibição.length > 0 ? (
                  <LineChart 
                    data={prepararDadosGraficoLinha()} 
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: { grid: { color: 'rgba(30, 41, 59, 0.3)' }, ticks: { color: '#64748b', font: { size: 10, family: 'JetBrains Mono' } } },
                        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' } } }
                      },
                      plugins: {
                        legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11, family: 'Plus Jakarta Sans' } } }
                      }
                    }} 
                  />
                ) : (
                  <div className="text-xs text-slate-500 font-medium text-center pt-28">Nenhum log histórico encontrado para os parâmetros selecionados.</div>
                )}
              </div>
            </section>

            {/* Livro de Ordens */}
            <section className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 bg-slate-900/50 border-b border-slate-900">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">📋 Livro de Ordens e Movimentações Financeiras</h3>
              </div>
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-900 font-mono text-[11px]">
                      <th className="p-4">Data</th>
                      <th className="p-4">Ativo</th>
                      <th className="p-4">Ação</th>
                      <th className="p-4">Volume</th>
                      <th className="p-4">Custo Unitário</th>
                      <th className="p-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-medium">
                    {transacoes.map(tx => {
                      if (!tx) return null;
                      return (
                        <tr key={tx.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="p-4 font-mono text-slate-400">{tx.registrado_em ? new Date(tx.registrado_em).toLocaleDateString('pt-BR') : '---'}</td>
                          <td className="p-4 font-bold text-blue-400 font-mono tracking-wider">{tx.ticker?.toUpperCase()}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold font-mono tracking-wide ${tx.tipo === 'COMPRA' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                              {tx.tipo}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-slate-300">{tx.quantidade} un</td>
                          <td className="p-4 font-mono text-slate-300">R$ {parseFloat(tx.preco || 0).toFixed(2)}</td>
                          <td className="p-4 text-center flex items-center justify-center gap-4">
                            <button onClick={() => abrirModalTransacao(tx.id)} className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 font-semibold transition-colors">
                              ✏️ Ajustar
                            </button>
                            <button onClick={() => excluirTransacao(tx.id, tx.ticker)} className="text-slate-600 hover:text-rose-400 text-xs transition-colors">
                              ✕ Deletar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {transacoes.length === 0 && (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-xs text-slate-500 font-medium">Nenhum lançamento contábil registrado no histórico do sistema.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {abaAtiva === 'metas' && (
          <div className="space-y-6">
            
            {/* CENTRAL DE ALERTAS DINÂMICOS DO SISTEMA */}
            {alertasSistema.length > 0 && (
              <div className="bg-rose-950/40 border border-rose-900/60 rounded-2xl p-5 space-y-2.5 shadow-md">
                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <span>📢</span> Alertas de Alocação e Rebalanceamento
                </h4>
                <div className="space-y-1.5">
                  {alertasSistema.map((alerta, idx) => (
                    <p key={idx} className="text-xs text-rose-300 font-medium leading-relaxed font-mono">
                      {alerta}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* DEFINIÇÃO DE PERCENTUAL POR CATEGORIA (MÁXIMO 100%) - CORRIGIDO SEM TRAVAMENTO */}
              <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-2xl space-y-6 shadow-md">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">📊 1. Percentual por Categoria (Max 100%)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Estipule o teto macro. Salva ao sair do campo ou apertar Enter.</p>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {Object.entries(setoresMeta).map(([nome, meta]) => (
                    <div key={nome} className="bg-slate-950 p-3.5 rounded-xl border border-slate-900">
                      <span className="text-xs font-bold text-slate-300 block mb-2">{nome}</span>
                      <div className="flex items-center gap-2">
                        <InputMetaMecanismo 
                          nomeSetor={nome} 
                          valorInicial={meta} 
                          aoSalvar={atualizarSetorMetaBD} 
                        />
                        <span className="text-xs text-slate-500 font-bold">% meta</span>
                      </div>
                    </div>
                  ))}
                  {Object.keys(setoresMeta).length === 0 && (
                    <p className="text-xs text-slate-500 font-medium text-center">Cadastre um ticker na home para habilitar as categorias automaticamente.</p>
                  )}
                </div>
              </div>

              {/* DISTRIBUIÇÃO INTERNA DOS ATIVOS DENTRO DA CATEGORIA */}
              <div className="lg:col-span-2 bg-slate-900/40 border border-slate-900 p-6 rounded-2xl space-y-6 shadow-md">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">🔗 2. Distribuição e Pesos por Ativo</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Defina o peso relativo (0% a 100%) que este ativo representa exclusivamente dentro de sua categoria pai.</p>
                </div>
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-2">
                  {tickets.map(t => {
                    const metaInfo = ativosMeta[t.ticker.toUpperCase()] || { setor: 'Sem Setor', metaGrupo: 0 };
                    return (
                      <div key={t.id} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center bg-slate-950 p-3.5 rounded-xl border border-slate-900">
                        <div>
                          <span className="text-xs font-bold text-blue-400 tracking-wider font-mono">{t.ticker.toUpperCase()}</span>
                          <p className="text-[11px] text-slate-400 font-medium line-clamp-1 mt-0.5">{t.nome}</p>
                        </div>
                        <div>
                          <select 
                            value={metaInfo.setor} 
                            onChange={e => vincularAtivoAoSetorBD(t.ticker, e.target.value, metaInfo.metaGrupo)}
                            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 font-medium focus:outline-none"
                          >
                            <option value="Sem Setor">Sem Setor</option>
                            {Object.keys(setoresMeta).map(sNome => (
                              <option key={sNome} value={sNome}>{sNome}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <InputPesoAtivoMecanismo 
                              ticker={t.ticker}
                              setor={metaInfo.setor}
                              valorInicial={metaInfo.metaGrupo}
                              aoSalvar={vincularAtivoAoSetorBD}
                            />
                            <span className="text-[11px] text-slate-500 font-medium">% no setor</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: Criar/Editar Ticker */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black animate-slide-up space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-white">{modalId ? 'Atualizar Identificação' : 'Acoplar Novo Ativo'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Os metadados corporativos serão recuperados via Brapi.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white text-xs">✕</button>
            </div>
            <form onSubmit={salvarTicket} className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Código do Ativo (Ticker)</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Ex: PETR4, IVVB11" 
                    disabled={!!modalId} 
                    value={modalTicker} 
                    onChange={e => setModalTicker(e.target.value)} 
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono uppercase focus:outline-none" 
                  />
                  {!modalId && (
                    <button 
                      type="button" 
                      onClick={() => selecionarSugestao(modalTicker)}
                      className="px-3 bg-blue-600 text-xs font-bold rounded-xl text-white hover:bg-blue-500"
                    >
                      Buscar
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Razão Social / Nome Fantasia</label>
                <input type="text" placeholder="Preenchimento automático" value={modalNome} onChange={e => setModalNome(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-medium focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Setor Identificado (Heurística)</label>
                <input type="text" disabled value={modalSetorAuto || 'Aguardando ticker...'} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-500 font-medium focus:outline-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 text-xs font-bold rounded-xl border border-slate-800 transition-colors">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-colors">Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Ordem */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black animate-slide-up space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-white">{txId ? 'Auditar Registro de Ordem' : 'Grave Nova Transação Comercial'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">O preço médio global do portfólio será recalculado.</p>
              </div>
              <button onClick={() => setIsTxModalOpen(false)} className="text-slate-500 hover:text-white text-xs">✕</button>
            </div>
            <form onSubmit={salvarTransacao} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">Ticker Vinculado</label>
                  <select value={txTicker} onChange={e => setTxTicker(e.target.value.toUpperCase())} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none">
                    {tickets.map(t => (
                      <option key={t.id} value={t.ticker.toUpperCase()}>{t.ticker.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">Natureza da Operação</label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                    <button type="button" onClick={() => setTxTipo('COMPRA')} className={`py-1 text-[10px] font-bold rounded-lg transition-all ${txTipo === 'COMPRA' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500'}`}>COMPRA</button>
                    <button type="button" onClick={() => setTxTipo('VENDA')} className={`py-1 text-[10px] font-bold rounded-lg transition-all ${txTipo === 'VENDA' ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30' : 'text-slate-500'}`}>VENDA</button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">Quantidade Líquida</label>
                  <input type="number" placeholder="Qtd" value={txQuantidade} onChange={e => setTxQuantidade(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 font-medium mb-1">Preço Unitário (R$)</label>
                  <input type="number" step="0.01" placeholder="Preço" value={txPreco} onChange={e => setTxPreco(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Data da Execução</label>
                <input type="date" value={txData} onChange={e => setTxData(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsTxModalOpen(false)} className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 text-xs font-bold rounded-xl border border-slate-800 transition-colors">Descartar</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold rounded-xl shadow-md transition-colors">Salvar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
