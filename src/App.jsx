import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

const SETOR_PADRAO = 'Outros / Não Classificado';
const PALETA_CATEGORIAS = ['#6366f1', '#14b8a6', '#f43f5e', '#eab308', '#a855f7', '#06b6d4', '#3b82f6', '#10b981', '#ec4899', '#f97316'];
const corDaCategoria = (idx) => PALETA_CATEGORIAS[idx % PALETA_CATEGORIAS.length];

const HORARIO_ABERTURA = 10;
const HORARIO_FECHAMENTO = 17;
const INTERVALO_MINUTOS = 15;
const INTERVALO_MS = INTERVALO_MINUTOS * 60 * 1000;

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState('home');
  const [tickets, setTickets] = useState([]);
  const [transacoes, setTransacoes] = useState([]);
  const [valuations, setValuations] = useState([]);
  const [sectorRules, setSectorRules] = useState([]);
  const [logsHistoricos, setLogsHistoricos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isCronRunning, setIsCronRunning] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('Nunca verificado');
  const [tempoRestante, setTempoRestante] = useState('15:00');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [isMercadoAberto, setIsMercadoAberto] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalId, setModalId] = useState('');
  const [modalTicker, setModalTicker] = useState('');
  const [modalNome, setModalNome] = useState('');
  const [modalSetorAuto, setModalSetorAuto] = useState('');
  const [modalSetorSelecionado, setModalSetorSelecionado] = useState('');
  
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txId, setTxId] = useState('');
  const [txTicker, setTxTicker] = useState('');
  const [txTipo, setTxTipo] = useState('COMPRA');
  const [txQuantidade, setTxQuantidade] = useState('');
  const [txPreco, setTxPreco] = useState('');
  const [txData, setTxData] = useState(new Date().toISOString().split('T')[0]);

  const [isValModalOpen, setIsValModalOpen] = useState(false);
  const [valTicker, setValTicker] = useState('');
  const [valMetodologia, setValMetodologia] = useState('bazin');
  const [valPrecoTeto, setValPrecoTeto] = useState('');
  const [valMargem, setValMargem] = useState('');

  const [sugestoes, setSugestoes] = useState([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
  const [ativosSelecionados, setAtivosSelecionados] = useState([]);
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [setoresMeta, setSetoresMeta] = useState({});
  const [ativosMeta, setAtivosMeta] = useState({});
  const [novoSetorNome, setNovoSetorNome] = useState('');
  const [novoSetorMeta, setNovoSetorMeta] = useState('');
  const [modoValorGraficos, setModoValorGraficos] = useState('percentual');
  const [precosAtuais, setPrecosAtuais] = useState({});
  
  const ultimaRequisicaoRef = useRef(null);
  const cronometroIntervalRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  const verificarMercadoAberto = useCallback(() => {
    const agora = new Date();
    const hora = agora.getHours();
    const diaSemana = agora.getDay();
    if (diaSemana === 0 || diaSemana === 6) return false;
    return hora >= HORARIO_ABERTURA && hora < HORARIO_FECHAMENTO;
  }, []);

  const calcularPrecoMedio = useCallback((ticker) => {
    const transacoesAtivo = transacoes
      .filter(tx => tx.ticker.toUpperCase() === ticker.toUpperCase())
      .sort((a, b) => new Date(a.registrado_em) - new Date(b.registrado_em));

    let quantidade = 0;
    let custoTotal = 0;

    transacoesAtivo.forEach(tx => {
      const q = Number(tx.quantidade);
      const p = Number(tx.preco);

      if (tx.tipo === 'COMPRA') {
        custoTotal += q * p;
        quantidade += q;
      } else {
        if (quantidade > 0) {
          const precoMedio = custoTotal / quantidade;
          custoTotal -= precoMedio * q;
          quantidade -= q;
          if (quantidade <= 0) {
            quantidade = 0;
            custoTotal = 0;
          }
        }
      }
    });

    const precoMedio = quantidade > 0 ? custoTotal / quantidade : 0;
    return { quantidade, precoMedio, custoTotal };
  }, [transacoes]);

  const buscarPrecosBrapi = useCallback(async (tickers) => {
    if (!tickers || tickers.length === 0) return {};
    try {
      const listaTickers = tickers.map(t => {
        const tk = t.toUpperCase().trim();
        return tk.endsWith('.SA') ? tk : `${tk}.SA`;
      }).join(',');

      console.log(`🔍 Buscando preços para: ${listaTickers}`);
      const response = await fetch(`https://brapi.dev/api/quote/${listaTickers}?token=${BRAPI_TOKEN}`);
      if (!response.ok) {
        console.error(`❌ Erro na Brapi: ${response.status}`);
        return {};
      }
      const dados = await response.json();
      const precos = {};
      if (dados && dados.results) {
        dados.results.forEach(ativo => {
          if (ativo && ativo.symbol && ativo.regularMarketPrice !== undefined) {
            const chaveLimpa = ativo.symbol.toUpperCase().replace('.SA', '').trim();
            precos[chaveLimpa] = parseFloat(ativo.regularMarketPrice);
          }
        });
      }
      return precos;
    } catch (error) {
      console.error('❌ Erro ao buscar preços da Brapi:', error);
      return {};
    }
  }, []);

  const atualizarPrecos = useCallback(async (force = false) => {
    if (!force) {
      const aberto = verificarMercadoAberto();
      if (!aberto) {
        console.log('⏰ Mercado fechado.');
        return;
      }
    }
    
    if (!force && ultimaRequisicaoRef.current) {
      const agora = Date.now();
      const diff = agora - ultimaRequisicaoRef.current;
      if (diff < INTERVALO_MS - 5000) {
        const restante = Math.ceil((INTERVALO_MS - diff) / 1000);
        console.log(`⏳ Aguardando ${restante}s`);
        return;
      }
    }
    
    if (!tickets || tickets.length === 0 || isCronRunning) return;
    
    setIsCronRunning(true);
    ultimaRequisicaoRef.current = Date.now();
    
    try {
      const tickers = tickets.map(t => t.ticker);
      const precos = await buscarPrecosBrapi(tickers);
      
      if (Object.keys(precos).length === 0) return;
      
      setPrecosAtuais(precos);
      setUltimaAtualizacao(new Date());
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));
      
      const logsNovos = [];
      Object.entries(precos).forEach(([ticker, preco]) => {
        if (preco > 0) {
          logsNovos.push({
            ticker: ticker,
            preco: parseFloat(preco.toFixed(2)),
            status: "Atualização Automática",
            registrado_em: new Date().toISOString()
          });
        }
      });

      if (logsNovos.length > 0) {
        for (let i = 0; i < logsNovos.length; i += 50) {
          const batch = logsNovos.slice(i, i + 50);
          await fetch(`${SB_URL}/rest/v1/finance_price_logs`, { 
            method: 'POST', 
            headers: SB_HDR, 
            body: JSON.stringify(batch) 
          });
        }
      }
      
      const resVal = await fetch(`${SB_URL}/rest/v1/finance_asset_valuation?order=ticker.asc`, { 
        method: 'GET', 
        headers: SB_HDR 
      });
      if (resVal.ok) {
        const dataVal = await resVal.json();
        setValuations(Array.isArray(dataVal) ? dataVal : []);
      }
      
      setTempoRestante(`${String(INTERVALO_MINUTOS).padStart(2, '0')}:00`);
      
      if (force) {
        showToast(`✅ Preços atualizados para ${Object.keys(precos).length} ativos`, 'success');
      }
    } catch (err) {
      console.error('❌ Erro:', err);
      if (force) showToast('❌ Erro ao atualizar: ' + err.message, 'error');
    } finally {
      setIsCronRunning(false);
    }
  }, [tickets, buscarPrecosBrapi, verificarMercadoAberto, isCronRunning]);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      console.log('📥 Carregando dados do banco...');
      const [resTickets, resTx, resVal, resRules, resLogs] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/finance_tickets?order=ticker.asc`, { method: 'GET', headers: SB_HDR }),
        fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR }),
        fetch(`${SB_URL}/rest/v1/finance_asset_valuation?order=ticker.asc`, { method: 'GET', headers: SB_HDR }),
        fetch(`${SB_URL}/rest/v1/finance_sector_rules`, { method: 'GET', headers: SB_HDR }),
        fetch(`${SB_URL}/rest/v1/finance_price_logs?order=registrado_em.desc&limit=500`, { method: 'GET', headers: SB_HDR })
      ]);
      
      const dataTickets = await resTickets.json();
      const dataTx = await resTx.json();
      const dataVal = await resVal.json();
      const dataRules = await resRules.json();
      const dataLogs = await resLogs.json();

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
                  metaGrupo: parseFloat(a.meta_grupo_percentual || 0) 
                };
              }
            });
          }
        }
      } catch (e) { console.error("Erro ao carregar metas de ativos:", e); }

      setTickets(Array.isArray(dataTickets) ? dataTickets : []);
      setTransacoes(Array.isArray(dataTx) ? dataTx : []);
      setValuations(Array.isArray(dataVal) ? dataVal : []);
      setSectorRules(Array.isArray(dataRules) ? dataRules : []);
      setLogsHistoricos(Array.isArray(dataLogs) ? dataLogs : []);
      setSetoresMeta(mapeamentoSetores);
      setAtivosMeta(mapeamentoAtivos);

      if (dataTickets && dataTickets.length > 0 && dataLogs && dataLogs.length > 0) {
        const precosDoBanco = {};
        dataTickets.forEach(t => {
          const tkr = t.ticker.toUpperCase();
          const ultimoLog = dataLogs.find(l => l.ticker.toUpperCase() === tkr);
          if (ultimoLog && ultimoLog.preco) {
            precosDoBanco[tkr] = parseFloat(ultimoLog.preco);
          }
        });
        if (Object.keys(precosDoBanco).length > 0) {
          setPrecosAtuais(precosDoBanco);
        }
      }

    } catch (err) {
      console.error('❌ Erro:', err);
      showToast("Erro na sincronização: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  useEffect(() => {
    const verificarStatusMercado = () => {
      const aberto = verificarMercadoAberto();
      setIsMercadoAberto(aberto);
      return aberto;
    };

    const iniciarCronometro = () => {
      if (cronometroIntervalRef.current) clearInterval(cronometroIntervalRef.current);
      let segundosRestantes = INTERVALO_MINUTOS * 60;
      if (ultimaRequisicaoRef.current) {
        const diff = (Date.now() - ultimaRequisicaoRef.current) / 1000;
        if (diff < INTERVALO_MINUTOS * 60) {
          segundosRestantes = Math.max(0, (INTERVALO_MINUTOS * 60) - diff);
        }
      }

      cronometroIntervalRef.current = setInterval(() => {
        if (!isCronRunning && isMercadoAberto) {
          segundosRestantes--;
          if (segundosRestantes <= 0) {
            if (isMercadoAberto) atualizarPrecos(false);
            segundosRestantes = INTERVALO_MINUTOS * 60;
          }
          const minutos = Math.floor(segundosRestantes / 60);
          const segundos = Math.floor(segundosRestantes % 60);
          setTempoRestante(`${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`);
        } else if (!isMercadoAberto) {
          setTempoRestante('🔒 Fechado');
        }
      }, 1000);
    };

    verificarStatusMercado();
    const mercadoInterval = setInterval(verificarStatusMercado, 60000);
    iniciarCronometro();

    if (verificarMercadoAberto() && tickets.length > 0) {
      if (!ultimaRequisicaoRef.current) {
        setTimeout(() => {
          if (verificarMercadoAberto()) atualizarPrecos(false);
        }, 5000);
      }
    }

    return () => {
      clearInterval(mercadoInterval);
      if (cronometroIntervalRef.current) clearInterval(cronometroIntervalRef.current);
    };
  }, [tickets, atualizarPrecos, verificarMercadoAberto, isCronRunning]);

  // Sugestões de ticker
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
          if (dados && dados.stocks) setSugestoes(dados.stocks.slice(0, 5));
        }
      } catch (error) { console.error(error); }
      finally { setLoadingSugestoes(false); }
    }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [modalTicker, modalId]);

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
    } catch (e) { console.error('Fallback:', e); }
    return '';
  };

  const inferirSetorPorSufixo = (tickerLimpo) => {
    const t = tickerLimpo.toUpperCase().trim();
    if (t.endsWith('11')) return 'Fundos Imobiliários / Units';
    return 'Outros / Não Classificado';
  };

  const selecionarSugestao = async (tickerSelecionado) => {
    let limpo = tickerSelecionado.toUpperCase().trim();
    const tickerComSufixo = limpo.endsWith('.SA') ? limpo : `${limpo}.SA`;
    setModalTicker(limpo.replace('.SA', ''));
    setSugestoes([]);
    setLoadingSugestoes(true);
    try {
      const res = await fetch(`https://brapi.dev/api/quote/${tickerComSufixo}?modules=summaryProfile&token=${BRAPI_TOKEN}`);
      let nomeCompleto = '', setorExtraido = '';
      if (res.ok) {
        const data = await res.json();
        if (data && data.results && data.results[0]) {
          const ativoObjeto = data.results[0];
          nomeCompleto = ativoObjeto.longName || ativoObjeto.shortName || 'Empresa Cadastrada';
          setorExtraido = ativoObjeto.summaryProfile?.sector || 
                         ativoObjeto.summaryProfile?.sectorDisp || 
                         ativoObjeto.summaryProfile?.industry || 
                         ativoObjeto.summaryProfile?.industryDisp || 
                         ativoObjeto.sector || 
                         ativoObjeto.industry || 
                         ativoObjeto.segment || '';
        }
      }
      if (!setorExtraido) setorExtraido = await buscarSetorFallbackViaLista(limpo);
      if (!setorExtraido) setorExtraido = inferirSetorPorSufixo(limpo);
      if (nomeCompleto) setModalNome(nomeCompleto);
      setModalSetorAuto(setorExtraido);
      setModalSetorSelecionado(setorExtraido);
    } catch (e) { 
      console.error(e); 
      setModalSetorAuto(inferirSetorPorSufixo(limpo));
      setModalSetorSelecionado(inferirSetorPorSufixo(limpo));
    } finally { 
      setLoadingSugestoes(false); 
    }
  };

  const abrirModalEditarTicket = async (id, ticker, nomeAtual) => {
    setModalId(id);
    setModalTicker(ticker.toUpperCase());
    setModalNome(nomeAtual);
    setModalSetorAuto('');
    setModalSetorSelecionado('');
    setIsModalOpen(true);
    await selecionarSugestao(ticker);
  };

  const persistirSetorAtivo = async (tkrChave, setorDefinido, pesoGrupoExistente = null) => {
    try {
      const setorExistente = setoresMeta[setorDefinido];
      const metaValue = setorExistente !== undefined ? setorExistente : 0;
      
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ nome: setorDefinido, meta_percentual: metaValue })
      });

      const pesoGrupo = (pesoGrupoExistente !== null && pesoGrupoExistente !== undefined) ? pesoGrupoExistente : 100;

      await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ ticker: tkrChave, setor_nome: setorDefinido, meta_grupo_percentual: pesoGrupo })
      });

      await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkrChave}`, {
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({ setor_nome: setorDefinido, meta_grupo_percentual: pesoGrupo })
      });

      setAtivosMeta(prev => ({ ...prev, [tkrChave]: { setor: setorDefinido, metaGrupo: pesoGrupo } }));
      return true;
    } catch (error) {
      console.error('Erro em persistirSetorAtivo:', error);
      throw error;
    }
  };

  const salvarTicket = async (e) => {
    e.preventDefault();
    if (!modalTicker.trim() || !modalNome.trim()) {
      showToast('Preencha todos os campos obrigatórios', 'error');
      return;
    }
    const tkrChave = modalTicker.trim().toUpperCase();
    const setorDefinido = modalSetorSelecionado || modalSetorAuto || SETOR_PADRAO;
    const pesoGrupoAtual = ativosMeta[tkrChave]?.metaGrupo || 100;

    try {
      if (modalId) {
        await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, { 
          method: 'PATCH', headers: SB_HDR, body: JSON.stringify({ nome: modalNome }) 
        });
        await persistirSetorAtivo(tkrChave, setorDefinido, pesoGrupoAtual);
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_tickets`, { 
          method: 'POST', headers: SB_HDR, 
          body: JSON.stringify({ ticker: tkrChave, nome: modalNome, quantidade: 0, preco_custo: 0 }) 
        });
        await persistirSetorAtivo(tkrChave, setorDefinido);
      }
      setIsModalOpen(false);
      await carregarDados();
      showToast(`Ticker ${tkrChave} sincronizado com setor: ${setorDefinido}`, 'success');
    } catch (err) { 
      console.error('Erro:', err);
      showToast('Erro ao salvar: ' + err.message, 'error'); 
    }
  };

  const excluirTicket = async (id, ticker) => {
    if (!window.confirm(`⚠️ ATENÇÃO EXCLUSÃO:\nVocê tem certeza de que deseja remover permanentemente o painel de monitoramento do ativo ${ticker.toUpperCase()}? Esta ação não pode ser desfeita.`)) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${ticker.toUpperCase()}`, { method: 'DELETE', headers: SB_HDR });
      await carregarDados();
      showToast(`Ativo ${ticker.toUpperCase()} removido com sucesso.`);
    } catch (err) { showToast(err.message, 'error'); }
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
      const setorInfo = ativosMeta[tkr]?.setor || '';
      const bodyData = { ticker: tkr, tipo: txTipo, quantidade: qty, preco: prc, registrado_em: dataIso, setor: setorInfo };

      if (txId) {
        await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${txId}`, {
          method: 'PATCH', headers: SB_HDR, body: JSON.stringify(bodyData)
        });
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_transactions`, {
          method: 'POST', headers: SB_HDR, body: JSON.stringify(bodyData)
        });
      }

      setIsTxModalOpen(false);
      await carregarDados();
      showToast('Ordem processada com sucesso!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTransacao = async (id, ticker) => {
    if (!confirm('Deseja deletar este lançamento do extrato?')) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      await carregarDados();
      showToast('Lançamento removido permanentemente.');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const abrirModalValuation = (ticker) => {
    setValTicker(ticker);
    setValMetodologia('bazin');
    setValPrecoTeto('');
    setValMargem('');
    setIsValModalOpen(true);
  };

  const salvarValuation = async (e) => {
    e.preventDefault();
    try {
      await fetch(`${SB_URL}/rest/v1/finance_asset_valuation`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({
          ticker: valTicker.toUpperCase(),
          metodologia: valMetodologia,
          preco_teto: parseFloat(valPrecoTeto),
          margem_seguranca: parseFloat(valMargem) || 0
        })
      });
      setIsValModalOpen(false);
      await carregarDados();
      showToast(`Preço teto ${valMetodologia} calculado para ${valTicker}`, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const adicionarSetor = async (e) => {
    e.preventDefault();
    if (!novoSetorNome.trim()) return;
    try {
      const metaValue = parseFloat(novoSetorMeta) || 0;
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ nome: novoSetorNome.trim(), meta_percentual: metaValue })
      });
      setSetoresMeta(prev => ({ ...prev, [novoSetorNome.trim()]: metaValue }));
      setNovoSetorNome('');
      setNovoSetorMeta('');
      await carregarDados();
      showToast('Novo setor adicionado com sucesso!', 'success');
    } catch (err) { console.error(err); showToast('Erro ao adicionar setor', 'error'); }
  };

  const atualizarSetorMetaBD = async (setor, valor) => {
    try {
      const novoValor = parseFloat(valor) || 0;
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ nome: setor, meta_percentual: novoValor })
      });
      setSetoresMeta(prev => ({ ...prev, [setor]: novoValor }));
    } catch (err) { console.error(err); showToast('Erro ao atualizar meta', 'error'); }
  };

  const removerSetor = async (setor) => {
    if (!confirm(`Remover permanentemente o setor "${setor}"?`)) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors?nome=eq.${setor}`, { method: 'DELETE', headers: SB_HDR });
      setSetoresMeta(prev => { const newState = { ...prev }; delete newState[setor]; return newState; });
      await carregarDados();
      showToast(`Setor ${setor} removido`, 'success');
    } catch (e) { console.error(e); showToast('Erro ao remover setor', 'error'); }
  };

  const vincularAtivoAoSetorBD = async (ticker, setor, metaGrupo) => {
    const tkr = ticker.toUpperCase();
    const mGrupo = parseFloat(metaGrupo) || 0;
    const setorFinal = setor || SETOR_PADRAO;
    
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ nome: setorFinal, meta_percentual: setoresMeta[setorFinal] || 0 })
      });

      await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ ticker: tkr, setor_nome: setorFinal, meta_grupo_percentual: mGrupo })
      });
      
      await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkr}`, {
        method: 'PATCH', headers: SB_HDR,
        body: JSON.stringify({ setor_nome: setorFinal, meta_grupo_percentual: mGrupo })
      });
      
      setAtivosMeta(prev => ({ ...prev, [tkr]: { setor: setorFinal, metaGrupo: mGrupo } }));
      showToast(`Setor de ${tkr} atualizado para ${setorFinal}`, 'success');
    } catch (e) { console.error(e); showToast("Erro ao salvar setor.", "error"); }
  };

  const normalizarSetor = (valor) => {
    if (!valor || valor === 'Sem Setor' || valor === 'Sem Grupo') return SETOR_PADRAO;
    return valor;
  };

  const alternarSelecaoAtivo = (ticker) => {
    const tkr = ticker.toUpperCase();
    if (ativosSelecionados.includes(tkr)) {
      setAtivosSelecionados(ativosSelecionados.filter(item => item !== tkr));
    } else {
      setAtivosSelecionados([...ativosSelecionados, tkr]);
    }
  };

  const patrimonio = useMemo(() => {
    let total = 0;
    const ativos = {};
    tickets.forEach(t => {
      const tkr = t.ticker.toUpperCase();
      const { quantidade, precoMedio } = calcularPrecoMedio(tkr);
      if (quantidade > 0) {
        const precoAtual = precosAtuais[tkr] || precoMedio;
        const valor = quantidade * precoAtual;
        total += valor;
        ativos[tkr] = { quantidade, precoMedio, precoAtual, valor };
      }
    });
    return { total, ativos };
  }, [tickets, calcularPrecoMedio, precosAtuais]);

  const totalPatrimonioReal = patrimonio.total;

  const resumoCategorias = useMemo(() => {
    const mapa = {};
    Object.keys(setoresMeta).forEach(setor => {
      mapa[setor] = { setor, metaPct: setoresMeta[setor] || 0, realValor: 0 };
    });
    tickets.forEach(t => {
      if (!t) return;
      const tkr = t.ticker.toUpperCase();
      const posicao = patrimonio.ativos[tkr];
      if (posicao && posicao.quantidade > 0) {
        const setor = normalizarSetor(ativosMeta[tkr]?.setor);
        if (!mapa[setor]) mapa[setor] = { setor, metaPct: setoresMeta[setor] || 0, realValor: 0 };
        mapa[setor].realValor += posicao.valor;
      }
    });
    return Object.values(mapa).sort((a, b) => b.metaPct - a.metaPct);
  }, [setoresMeta, tickets, patrimonio.ativos, ativosMeta]);

  const totalMetaPct = resumoCategorias.reduce((acc, c) => acc + c.metaPct, 0);

  const ativosAgrupadosPorSetor = useMemo(() => {
    const grupos = {};
    Object.keys(setoresMeta).forEach(s => { grupos[s] = []; });
    tickets.forEach(t => {
      if (!t) return;
      const tkr = t.ticker.toUpperCase();
      const info = ativosMeta[tkr] || { setor: '', metaGrupo: 0 };
      const setor = normalizarSetor(info.setor);
      if (!grupos[setor]) grupos[setor] = [];
      grupos[setor].push({ 
        ticket: t, 
        metaGrupo: info.metaGrupo || 0,
        posicao: patrimonio.ativos[tkr] || { quantidade: 0, precoMedio: 0, precoAtual: 0, valor: 0 }
      });
    });
    return grupos;
  }, [setoresMeta, tickets, ativosMeta, patrimonio.ativos]);

  const prepararPizzaMetaPorCategoria = useMemo(() => ({
    labels: resumoCategorias.map(c => c.setor),
    datasets: [{
      data: resumoCategorias.map(c => c.metaPct),
      backgroundColor: resumoCategorias.map((_, i) => corDaCategoria(i)),
      borderWidth: 0
    }]
  }), [resumoCategorias]);

  const prepararPizzaRealPorCategoria = useMemo(() => ({
    labels: resumoCategorias.map(c => c.setor),
    datasets: [{
      data: resumoCategorias.map(c => c.realValor),
      backgroundColor: resumoCategorias.map((_, i) => corDaCategoria(i)),
      borderWidth: 0
    }]
  }), [resumoCategorias]);

  const formatarValorExibicao = (categoria, campo) => {
    if (campo === 'meta') {
      return modoValorGraficos === 'percentual'
        ? `${categoria.metaPct.toFixed(1)}%`
        : `R$ ${((categoria.metaPct / 100) * totalPatrimonioReal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }
    const realPct = totalPatrimonioReal > 0 ? (categoria.realValor / totalPatrimonioReal) * 100 : 0;
    return modoValorGraficos === 'percentual'
      ? `${realPct.toFixed(1)}%`
      : `R$ ${categoria.realValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  };

  const calcularDeltaPP = (categoria) => {
    const realPct = totalPatrimonioReal > 0 ? (categoria.realValor / totalPatrimonioReal) * 100 : 0;
    return realPct - categoria.metaPct;
  };

  const opcoesPizzaPercentual = (titulo, tipo = 'meta') => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: titulo, color: '#f8fafc', font: { size: 14, family: 'Plus Jakarta Sans', weight: '700' }, padding: { bottom: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const valor = ctx.parsed;
            if (tipo === 'meta') return ` ${ctx.label}: ${valor.toFixed(1)}%`;
            const pct = totalPatrimonioReal > 0 ? (valor / totalPatrimonioReal) * 100 : 0;
            return ` ${ctx.label}: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${pct.toFixed(1)}%)`;
          }
        }
      }
    }
  });

  const logsFinaisExibicao = useMemo(() => {
    return Array.isArray(logsHistoricos) ? logsHistoricos.filter(log => {
      if (!log || !log.registrado_em) return false;
      const d = log.registrado_em.split('T')[0];
      return d >= dataInicio && d <= dataFim && (ativosSelecionados.length === 0 || ativosSelecionados.includes(log.ticker.toUpperCase()));
    }) : [];
  }, [logsHistoricos, dataInicio, dataFim, ativosSelecionados]);

  const prepararDadosGraficoLinha = useMemo(() => {
    const todosOsHorarios = [...new Set(logsFinaisExibicao.map(l => {
      const d = new Date(l.registrado_em);
      return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }))];
    const tickersParaPlotar = ativosSelecionados.length > 0 ? ativosSelecionados : [...new Set(logsHistoricos.map(l => l && l.ticker ? l.ticker.toUpperCase() : ''))].filter(Boolean);
    return {
      labels: todosOsHorarios,
      datasets: tickersParaPlotar.map((ticker, idx) => {
        const logsDoAtivo = logsFinaisExibicao.filter(l => l && l.ticker && l.ticker.toUpperCase() === ticker);
        return {
          label: ticker,
          data: logsDoAtivo.map(l => parseFloat(l.preco || 0)),
          borderColor: ['#3b82f6', '#10b981', '#f43f5e', '#eab308', '#8b5cf6', '#ec4899', '#14b8a6'][idx % 7],
          borderWidth: 2, fill: false, tension: 0.2, pointRadius: 2
        };
      }).filter(dataset => dataset.data.length > 0)
    };
  }, [logsFinaisExibicao, ativosSelecionados, logsHistoricos]);

  const getValuationsPorTicker = (ticker) => valuations.filter(v => v.ticker.toUpperCase() === ticker.toUpperCase());
  const getMetodologiaRecomendada = (setor) => {
    const rule = sectorRules.find(r => r.setor === setor);
    return rule?.metodologia_recomendada || 'Bazin';
  };

  const ejecutarCronVerificacao = async () => {
    if (!verificarMercadoAberto()) {
      showToast('⚠️ Mercado fechado. Atualização disponível apenas durante o pregão.', 'warning');
      return;
    }
    if (ultimaRequisicaoRef.current) {
      const diff = Date.now() - ultimaRequisicaoRef.current;
      if (diff < INTERVALO_MS - 10000) {
        const restante = Math.ceil((INTERVALO_MS - diff) / 60000);
        showToast(`⏳ Aguarde ${restante} minuto(s) para nova atualização`, 'warning');
        return;
      }
    }
    await atualizarPrecos(true);
  };

  // ===== RENDER =====
  return (
    <div className="min-h-screen p-4 md:p-8 text-slate-200">
      {toast.show && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-800 text-slate-200 text-xs shadow-2xl shadow-black/50 animate-slide-up">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

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
              <h1 className="text-2xl font-extrabold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent tracking-tight">LogTicket</h1>
              <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono px-1.5 py-0.5 rounded">v3.5</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">Gestão Automatizada de Portfólio com Preço Teto</p>
            <div className="flex gap-1 mt-4 bg-slate-950 p-1 rounded-xl border border-slate-800/80 w-fit">
              <button onClick={() => setAbaAtiva('home')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${abaAtiva === 'home' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-900/20' : 'text-slate-400 hover:text-slate-200'}`}>📊 Painel Geral</button>
              <button onClick={() => setAbaAtiva('metas')} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${abaAtiva === 'metas' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-900/20' : 'text-slate-400 hover:text-slate-200'}`}>⚙️ Metas & Setores</button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5 w-full md:w-auto items-center">
          <button onClick={() => abrirModalTransacao()} className="flex-1 md:flex-none px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-950/20 active:scale-[0.98]">💸 Registrar Ordem</button>
          <button onClick={() => { setModalId(''); setModalTicker(''); setModalNome(''); setModalSetorAuto(''); setIsModalOpen(true); }} className="flex-1 md:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-slate-100 font-bold text-xs rounded-xl transition-all shadow-lg active:scale-[0.98]">➕ Novo Ticker</button>
          <button onClick={ejecutarCronVerificacao} disabled={isCronRunning || !isMercadoAberto} className={`px-4 py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs font-bold font-mono text-slate-400 rounded-xl transition-all flex items-center gap-2 ${(isCronRunning || !isMercadoAberto) ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isCronRunning ? 'animate-ping bg-blue-400' : isMercadoAberto ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {isCronRunning ? 'Atualizando...' : isMercadoAberto ? '↻ Atualizar' : '🔒 Fechado'}
          </button>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 font-mono">Última: {lastCheckTime}</span>
            <span className={`text-[11px] font-mono font-bold ${isCronRunning ? 'text-blue-400 animate-pulse' : isMercadoAberto ? 'text-emerald-400' : 'text-red-400'}`}>
              ⏱️ {isMercadoAberto ? (isCronRunning ? 'Atualizando...' : tempoRestante) : '🔒 Fechado'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">
        {loading && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/5 border border-blue-500/10 rounded-xl text-xs font-mono text-blue-400 animate-pulse">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
            Sincronizando base de dados...
          </div>
        )}
        
        {abaAtiva === 'home' && (
          <>
            <div className="bg-slate-900/20 p-2 rounded-2xl border border-slate-900/60 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900/60 border border-slate-900/80 backdrop-blur-sm rounded-2xl p-6 h-72 shadow-lg">
                  {resumoCategorias.length > 0 && resumoCategorias.some(c => c.metaPct > 0) ? (
                    <Doughnut data={prepararPizzaMetaPorCategoria} options={opcoesPizzaPercentual('Alocação Objetiva / Meta (%)', 'meta')} />
                  ) : (
                    <div className="text-xs text-slate-500 font-medium text-center pt-28">Configure as metas na aba superior para visualizar.</div>
                  )}
                </div>
                <div className="bg-slate-900/60 border border-slate-900/80 backdrop-blur-sm rounded-2xl p-6 h-72 shadow-lg">
                  {resumoCategorias.some(c => c.realValor > 0) ? (
                    <Doughnut data={prepararPizzaRealPorCategoria} options={opcoesPizzaPercentual('Alocação Líquida Real (%)', 'real')} />
                  ) : (
                    <div className="text-xs text-slate-500 font-medium text-center pt-28">Lance compras no extrato para computar a distribuição real.</div>
                  )}
                </div>
              </div>

              {resumoCategorias.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-900/80 rounded-2xl p-5">
                  <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <div><h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Legenda & Comparativo por Categoria</h4><p className="text-[11px] text-slate-500 mt-0.5">Meta configurada vs. o que está efetivamente comprado, por setor.</p></div>
                    <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button type="button" onClick={() => setModoValorGraficos('percentual')} className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${modoValorGraficos === 'percentual' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>%</button>
                      <button type="button" onClick={() => setModoValorGraficos('reais')} className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${modoValorGraficos === 'reais' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>R$</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {resumoCategorias.map((cat, idx) => {
                      const deltaPP = calcularDeltaPP(cat);
                      const corDelta = Math.abs(deltaPP) <= 2 ? 'text-emerald-400' : (deltaPP > 0 ? 'text-amber-400' : 'text-rose-400');
                      return (
                        <div key={cat.setor} className="grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr] gap-2 items-center bg-slate-950 px-3 py-2 rounded-xl border border-slate-900 text-xs">
                          <div className="flex items-center gap-2 min-w-0 col-span-2 sm:col-span-1">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corDaCategoria(idx) }} />
                            <span className="font-semibold text-slate-300 truncate">{cat.setor}</span>
                          </div>
                          <div><span className="text-[10px] text-slate-500 block">Meta</span><strong className="font-mono text-purple-400">{formatarValorExibicao(cat, 'meta')}</strong></div>
                          <div><span className="text-[10px] text-slate-500 block">Real</span><strong className="font-mono text-blue-400">{formatarValorExibicao(cat, 'real')}</strong></div>
                          <div className="text-right sm:text-left"><span className="text-[10px] text-slate-500 block">Δ vs meta</span><strong className={`font-mono font-bold ${corDelta}`}>{deltaPP > 0 ? '+' : ''}{deltaPP.toFixed(1)} p.p.</strong></div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-900 text-[11px]">
                    <span className="text-slate-500">Soma das metas configuradas por categoria</span>
                    <span className={`font-mono font-bold ${Math.abs(totalMetaPct - 100) <= 0.5 ? 'text-emerald-400' : 'text-amber-400'}`}>{totalMetaPct.toFixed(1)}% <span className="text-slate-600">/ 100%</span></span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Ativos & Desempenho Operacional</h2>
                <span className="text-xs text-slate-400 font-medium bg-slate-900/60 border border-slate-900 px-2.5 py-1 rounded-lg">
                  Patrimônio: <strong className="font-mono text-white ml-1">R$ {totalPatrimonioReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tickets.map(t => {
                  if (!t) return null;
                  const tkr = t.ticker.toUpperCase();
                  const posicao = patrimonio.ativos[tkr] || { quantidade: 0, precoMedio: 0, precoAtual: 0, valor: 0 };
                  const qtdVal = posicao.quantidade;
                  const precoMedio = posicao.precoMedio;
                  const precoAtual = posicao.precoAtual || precoMedio;
                  const patrReal = posicao.valor;
                  const pctReal = totalPatrimonioReal > 0 ? (patrReal / totalPatrimonioReal) * 100 : 0;
                  
                  const mAtivo = ativosMeta[tkr];
                  const setorPai = normalizarSetor(mAtivo?.setor);
                  const pctSetorAlvo = setoresMeta[setorPai] || 0;
                  const pctAlvoGlobal = (pctSetorAlvo * (mAtivo?.metaGrupo || 0)) / 100;
                  const valuationsAtivo = getValuationsPorTicker(tkr);
                  const metodoRecomendado = getMetodologiaRecomendada(setorPai);

                  return (
                    <div key={t.id} className="bg-slate-900/40 backdrop-blur-sm border border-slate-900 rounded-2xl p-5 flex flex-col justify-between shadow-md hover:border-slate-800 transition-all hover:translate-y-[-1px]">
                      <div>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-lg font-black text-blue-400 tracking-wide font-mono">{tkr}</span>
                            <p className="text-xs text-slate-400 font-medium line-clamp-1 mt-0.5">{t.nome}</p>
                            <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-950 text-slate-400 border border-slate-800 rounded-md mt-2 inline-block font-medium">📁 {setorPai}</span>
                            {metodoRecomendado && <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md mt-2 ml-1 inline-block font-medium">📊 {metodoRecomendado}</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => abrirModalEditarTicket(t.id, t.ticker, t.nome)} className="p-1.5 text-slate-500 hover:text-blue-400 text-xs transition-colors rounded-lg hover:bg-blue-500/10">⚙️</button>
                            <button onClick={() => abrirModalValuation(tkr)} className="p-1.5 text-slate-500 hover:text-purple-400 text-xs transition-colors rounded-lg hover:bg-purple-500/10">📈</button>
                            <button onClick={() => excluirTicket(t.id, t.ticker)} className="p-1.5 text-slate-600 hover:text-rose-400 text-sm transition-colors rounded-lg hover:bg-rose-500/5">✕</button>
                          </div>
                        </div>

                        {valuationsAtivo.length > 0 && (
                          <div className="mt-3 grid grid-cols-3 gap-1 bg-slate-950 p-2 rounded-xl border border-slate-900">
                            {valuationsAtivo.map(v => (
                              <div key={v.id} className="text-center">
                                <span className="text-[8px] text-slate-500 block uppercase">{v.metodologia}</span>
                                <span className="text-[10px] font-mono text-purple-400 font-bold">R$ {parseFloat(v.preco_teto || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 bg-slate-950 p-2.5 rounded-xl border border-slate-900">
                          <div className="flex justify-between text-[11px] mb-1.5 font-medium">
                            <span className="text-slate-400">Atual: <strong className="font-mono text-blue-400">{pctReal.toFixed(1)}%</strong></span>
                            <span className="text-slate-400">Meta: <strong className="font-mono text-purple-400">{pctAlvoGlobal.toFixed(1)}%</strong></span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all" style={{ width: `${Math.min(pctReal, 100)}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-slate-900/80 flex justify-between items-end text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-wider">Custódia</span>
                          <span className="font-mono font-medium text-slate-300 mt-0.5 block">{qtdVal} un • R$ {precoMedio.toFixed(2)}</span>
                          <span className="font-mono text-[10px] text-slate-500 block">Preço Atual: R$ {precoAtual.toFixed(2)}</span>
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

            <div className="mt-6 bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 bg-slate-900/50 border-b border-slate-900 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">📊 Preços Teto por Ativo</h3>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 font-mono">⏱️ Próxima: {tempoRestante}</span>
                  <button onClick={ejecutarCronVerificacao} disabled={isCronRunning || !isMercadoAberto} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition-all flex items-center gap-2 disabled:opacity-50">
                    <span className={`w-1.5 h-1.5 rounded-full ${isCronRunning ? 'animate-ping bg-blue-400' : isMercadoAberto ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    {isCronRunning ? 'Atualizando...' : isMercadoAberto ? 'Atualizar' : 'Fechado'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-950 z-10">
                    <tr className="text-slate-400 border-b border-slate-900 font-mono text-[10px]">
                      <th className="p-3">Ticker</th>
                      <th className="p-3">Setor</th>
                      <th className="p-3 text-emerald-400">Preço Atual</th>
                      <th className="p-3 text-amber-400">Preço Médio</th>
                      <th className="p-3 text-purple-400">Bazin</th>
                      <th className="p-3 text-blue-400">Gordon</th>
                      <th className="p-3 text-emerald-400">Graham</th>
                      <th className="p-3 text-amber-400">Barsi</th>
                      <th className="p-3 text-pink-400">Fluxo Caixa</th>
                      <th className="p-3 text-cyan-400">Recomendado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60">
                    {tickets.map(t => {
                      if (!t) return null;
                      const tkr = t.ticker.toUpperCase();
                      const posicao = patrimonio.ativos[tkr] || { quantidade: 0, precoMedio: 0, precoAtual: 0 };
                      const setorPai = normalizarSetor(ativosMeta[tkr]?.setor);
                      const valuationsAtivo = getValuationsPorTicker(tkr);
                      const metodoRecomendado = getMetodologiaRecomendada(setorPai);
                      
                      const valMap = {};
                      valuationsAtivo.forEach(v => { valMap[v.metodologia] = parseFloat(v.preco_teto || 0); });

                      const precoAtual = posicao.precoAtual || parseFloat(t.preco_custo || 0);
                      const precoMedio = posicao.precoMedio || parseFloat(t.preco_custo || 0);
                      
                      return (
                        <tr key={t.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="p-3 font-bold text-blue-400 font-mono tracking-wider">{tkr}</td>
                          <td className="p-3 text-slate-400">{setorPai}</td>
                          <td className="p-3 font-mono"><span className={precoAtual > 0 ? 'text-emerald-400' : 'text-slate-500'}>R$ {precoAtual.toFixed(2)}</span></td>
                          <td className="p-3 font-mono text-amber-400">R$ {precoMedio.toFixed(2)}</td>
                          <td className="p-3 font-mono text-purple-400">{valMap['bazin'] ? `R$ ${valMap['bazin'].toFixed(2)}` : '-'}</td>
                          <td className="p-3 font-mono text-blue-400">{valMap['gordon'] ? `R$ ${valMap['gordon'].toFixed(2)}` : '-'}</td>
                          <td className="p-3 font-mono text-emerald-400">{valMap['graham'] ? `R$ ${valMap['graham'].toFixed(2)}` : '-'}</td>
                          <td className="p-3 font-mono text-amber-400">{valMap['barsi'] ? `R$ ${valMap['barsi'].toFixed(2)}` : '-'}</td>
                          <td className="p-3 font-mono text-pink-400">{valMap['fluxo_caixa'] ? `R$ ${valMap['fluxo_caixa'].toFixed(2)}` : '-'}</td>
                          <td className="p-3"><span className="px-2 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg text-[10px] font-mono font-bold">{metodoRecomendado}</span></td>
                        </tr>
                      );
                    })}
                    {tickets.length === 0 && (<tr><td colSpan="10" className="p-8 text-center text-xs text-slate-500 font-medium">Nenhum ativo cadastrado.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>

            <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-900 pb-4">
                <div><h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><span className="w-1.5 h-3 bg-blue-500 rounded-full" />🎛️ Flutuação e Evolução Histórica</h3><p className="text-xs text-slate-400 mt-0.5">Selecione e compare os ativos monitorados dinamicamente.</p></div>
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
                    <button key={t.id} type="button" onClick={() => alternarSelecaoAtivo(ativoChave)}
                      className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-all ${estaSelecionado ? 'bg-blue-500/10 border-blue-500/40 text-blue-400 shadow-inner' : 'bg-slate-900 border-slate-800/80 text-slate-400 hover:text-slate-200'}`}>
                      {ativoChave}
                    </button>
                  );
                })}
              </div>

              <div className="h-72 w-full pt-2">
                {logsFinaisExibicao.length > 0 && prepararDadosGraficoLinha.datasets.length > 0 ? (
                  <Line data={prepararDadosGraficoLinha} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: '#1e293b/30' }, ticks: { color: '#64748b', font: { size: 10, family: 'JetBrains Mono' } } }, x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9, family: 'JetBrains Mono' } } } }, plugins: { legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11, family: 'Plus Jakarta Sans' } } } } }} />
                ) : (
                  <div className="text-xs text-slate-500 font-medium text-center pt-28">Nenhum log histórico encontrado.</div>
                )}
              </div>
            </section>

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
                      <th className="p-4">Preço Unit.</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Setor</th>
                      <th className="p-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-medium">
                    {transacoes.map(tx => {
                      if (!tx) return null;
                      const total = parseFloat(tx.quantidade || 0) * parseFloat(tx.preco || 0);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="p-4 font-mono text-slate-400">{tx.registrado_em ? new Date(tx.registrado_em).toLocaleDateString('pt-BR') : '---'}</td>
                          <td className="p-4 font-bold text-blue-400 font-mono tracking-wider">{tx.ticker?.toUpperCase()}</td>
                          <td className="p-4"><span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold font-mono tracking-wide ${tx.tipo === 'COMPRA' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{tx.tipo}</span></td>
                          <td className="p-4 font-mono text-slate-300">{tx.quantidade} un</td>
                          <td className="p-4 font-mono text-slate-300">R$ {parseFloat(tx.preco || 0).toFixed(2)}</td>
                          <td className="p-4 font-mono text-amber-400">R$ {total.toFixed(2)}</td>
                          <td className="p-4 text-slate-400">{tx.setor || '-'}</td>
                          <td className="p-4 text-center flex items-center justify-center gap-4">
                            <button onClick={() => abrirModalTransacao(tx.id)} className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 font-semibold transition-colors">✏️ Ajustar</button>
                            <button onClick={() => excluirTransacao(tx.id, tx.ticker)} className="text-slate-600 hover:text-rose-400 text-xs transition-colors">✕ Deletar</button>
                          </td>
                        </tr>
                      );
                    })}
                    {transacoes.length === 0 && (<tr><td colSpan="8" className="p-8 text-center text-xs text-slate-500 font-medium">Nenhum lançamento contábil registrado.</td></tr>)}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {abaAtiva === 'metas' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-2xl space-y-6 shadow-md">
              <div><h3 className="text-sm font-bold text-slate-200">📌 Cadastrar Novo Setor</h3><p className="text-xs text-slate-400 mt-0.5">Estipule os limites macros do seu portfólio.</p></div>
              <form onSubmit={adicionarSetor} className="space-y-3">
                <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Nome do Setor</label><input type="text" placeholder="Ex: Tecnologia, Energia" value={novoSetorNome} onChange={e => setNovoSetorNome(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-slate-700 font-medium" /></div>
                <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Meta Alvo (%)</label><input type="number" placeholder="Ex: 25" value={novoSetorMeta} onChange={e => setNovoSetorMeta(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-slate-700 font-mono" /></div>
                <button type="submit" className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition-all shadow-md">Integrar Setor</button>
              </form>
              <div className="border-t border-slate-900 pt-4 space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Setores Ativos</h4>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {Object.entries(setoresMeta).map(([nome, meta]) => (
                    <div key={nome} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-900">
                      <div className="flex-1 mr-3">
                        <span className="text-xs font-semibold text-slate-300 block">{nome}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <input type="number" value={meta} onChange={e => atualizarSetorMetaBD(nome, e.target.value)} className="w-14 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[11px] font-mono text-slate-300 focus:outline-none focus:border-slate-700" />
                          <span className="text-[10px] text-slate-500 font-medium">% meta</span>
                        </div>
                      </div>
                      <button onClick={() => removerSetor(nome)} className="text-slate-600 hover:text-rose-400 text-xs px-2 py-1 rounded transition-colors">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-slate-900/40 border border-slate-900 p-6 rounded-2xl space-y-6 shadow-md">
              <div><h3 className="text-sm font-bold text-slate-200">🔗 Distribuição e Pesos por Ativo</h3><p className="text-xs text-slate-400 mt-0.5">Organizado por categoria. Defina quanto cada ativo representa dentro do seu setor.</p></div>
              <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                {Object.entries(ativosAgrupadosPorSetor).map(([setor, itens]) => {
                  const somaPesos = itens.reduce((acc, i) => acc + (parseFloat(i.metaGrupo) || 0), 0);
                  const opcoesSetor = [...new Set([...Object.keys(setoresMeta), SETOR_PADRAO])];
                  return (
                    <div key={setor} className="bg-slate-950 rounded-xl border border-slate-900 p-3.5">
                      <div className="flex justify-between items-center mb-2.5 gap-2">
                        <span className="text-xs font-bold text-purple-300">📁 {setor}</span>
                        {itens.length > 0 && <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${Math.abs(somaPesos - 100) <= 0.5 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{somaPesos.toFixed(0)}% do setor distribuído</span>}
                      </div>
                      {itens.length === 0 ? <p className="text-[11px] text-slate-600 italic">Nenhum ativo nesta categoria ainda.</p> : (
                        <div className="space-y-2">
                          {itens.map(({ ticket: t, metaGrupo, posicao }) => (
                            <div key={t.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                              <div><span className="text-xs font-bold text-blue-400 tracking-wider font-mono">{t.ticker.toUpperCase()}</span><p className="text-[10px] text-slate-500 font-medium line-clamp-1">{t.nome}</p></div>
                              <select value={setor} onChange={e => vincularAtivoAoSetorBD(t.ticker, e.target.value, metaGrupo)} className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-[11px] text-slate-300 font-medium focus:outline-none">
                                {opcoesSetor.map(sNome => <option key={sNome} value={sNome}>{sNome}</option>)}
                              </select>
                              <div className="flex items-center gap-2">
                                <input type="number" placeholder="Peso" value={metaGrupo} onChange={e => vincularAtivoAoSetorBD(t.ticker, setor, e.target.value)} className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none text-center" />
                                <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">% do setor</span>
                              </div>
                              <div className="text-right">
                                <span className="text-[9px] text-slate-500 block">Posição</span>
                                <span className="text-[10px] font-mono text-emerald-400">{posicao?.quantidade || 0} un</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
              <div><h3 className="text-sm font-bold text-white">{modalId ? 'Atualizar Identificação' : 'Acoplar Novo Ativo'}</h3><p className="text-xs text-slate-400 mt-0.5">Os metadados corporativos serão recuperados via Brapi.</p></div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white text-xs">✕</button>
            </div>
            <form onSubmit={salvarTicket} className="space-y-4">
              <div className="relative">
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Código do Ativo (Ticker)</label>
                <input type="text" placeholder="Ex: PETR4, IVVB11" disabled={!!modalId} value={modalTicker} onChange={e => setModalTicker(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono uppercase focus:outline-none" />
                {loadingSugestoes && <span className="absolute right-3 bottom-2.5 text-[10px] text-blue-400 font-mono animate-pulse">Buscando...</span>}
                {sugestoes.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden z-10 shadow-xl max-h-36 overflow-y-auto">
                    {sugestoes.map(s => <button key={s.stock} type="button" onClick={() => selecionarSugestao(s.stock)} className="w-full text-left px-3 py-2 text-xs font-mono text-slate-300 hover:bg-slate-900 transition-colors border-b border-slate-900 last:border-0">{s.stock} - <span className="text-slate-500 font-sans">{s.name}</span></button>)}
                  </div>
                )}
              </div>
              <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Razão Social / Nome Fantasia</label><input type="text" placeholder="Preenchimento automático" value={modalNome} onChange={e => setModalNome(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-medium focus:outline-none" /></div>
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">Setor do Ativo</label>
                <select value={modalSetorSelecionado || modalSetorAuto || SETOR_PADRAO} onChange={e => setModalSetorSelecionado(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-medium focus:outline-none focus:border-blue-500">
                  {Object.keys(setoresMeta).length > 0 ? Object.keys(setoresMeta).map(s => <option key={s} value={s}>{s}</option>) : <option value={modalSetorAuto || SETOR_PADRAO}>{modalSetorAuto || SETOR_PADRAO}</option>}
                  <option value={SETOR_PADRAO}>{SETOR_PADRAO}</option>
                </select>
                {modalSetorAuto && modalSetorAuto !== modalSetorSelecionado && (<p className="text-[9px] text-slate-500 mt-1">🔍 Detectado: {modalSetorAuto}</p>)}
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
            <div className="flex justify-between items-start"><div><h3 className="text-sm font-bold text-white">{txId ? 'Auditar Registro de Ordem' : 'Grave Nova Transação Comercial'}</h3><p className="text-xs text-slate-400 mt-0.5">O preço médio global do portfólio será recalculado.</p></div><button onClick={() => setIsTxModalOpen(false)} className="text-slate-500 hover:text-white text-xs">✕</button></div>
            <form onSubmit={salvarTransacao} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Ticker Vinculado</label><select value={txTicker} onChange={e => setTxTicker(e.target.value.toUpperCase())} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none">{tickets.map(t => <option key={t.id} value={t.ticker.toUpperCase()}>{t.ticker.toUpperCase()}</option>)}</select></div>
                <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Natureza da Operação</label><div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded-xl border border-slate-800"><button type="button" onClick={() => setTxTipo('COMPRA')} className={`py-1 text-[10px] font-bold rounded-lg transition-all ${txTipo === 'COMPRA' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500'}`}>COMPRA</button><button type="button" onClick={() => setTxTipo('VENDA')} className={`py-1 text-[10px] font-bold rounded-lg transition-all ${txTipo === 'VENDA' ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30' : 'text-slate-500'}`}>VENDA</button></div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Quantidade Líquida</label><input type="number" placeholder="Qtd" value={txQuantidade} onChange={e => setTxQuantidade(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" /></div>
                <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Preço Unitário (R$)</label><input type="number" step="0.01" placeholder="Preço" value={txPreco} onChange={e => setTxPreco(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" /></div>
              </div>
              <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Data da Execução</label><input type="date" value={txData} onChange={e => setTxData(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsTxModalOpen(false)} className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 text-xs font-bold rounded-xl border border-slate-800 transition-colors">Descartar</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold rounded-xl shadow-md transition-colors">Salvar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Valuation */}
      {isValModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black animate-slide-up space-y-4">
            <div className="flex justify-between items-start"><div><h3 className="text-sm font-bold text-white">📈 Definir Preço Teto</h3><p className="text-xs text-slate-400 mt-0.5">{valTicker} — Insira os valores calculados.</p></div><button onClick={() => setIsValModalOpen(false)} className="text-slate-500 hover:text-white text-xs">✕</button></div>
            <form onSubmit={salvarValuation} className="space-y-4">
              <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Metodologia</label>
                <select value={valMetodologia} onChange={e => setValMetodologia(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none">
                  <option value="bazin">Bazin (DY / 6%)</option>
                  <option value="gordon">Gordon (Dividendos + Crescimento)</option>
                  <option value="graham">Graham (Valor Intrínseco)</option>
                  <option value="barsi">Barsi (Dividend Yield)</option>
                  <option value="fluxo_caixa">Fluxo de Caixa Descontado</option>
                </select>
              </div>
              <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Preço Teto (R$)</label><input type="number" step="0.01" placeholder="Ex: 32.50" value={valPrecoTeto} onChange={e => setValPrecoTeto(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" /></div>
              <div><label className="block text-[11px] text-slate-400 font-medium mb-1">Margem de Segurança (%)</label><input type="number" step="0.1" placeholder="Ex: 20" value={valMargem} onChange={e => setValMargem(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsValModalOpen(false)} className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-400 text-xs font-bold rounded-xl border border-slate-800 transition-colors">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-md transition-colors">Salvar Preço Teto</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
