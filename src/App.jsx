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

// ===== CONFIGURAÇÕES DE PREGÃO =====
const HORARIO_ABERTURA = 10; // 10:00
const HORARIO_FECHAMENTO = 17; // 17:00
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
  const [proximaAtualizacaoManual, setProximaAtualizacaoManual] = useState(null);
  
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
  const [indicadoresFundamentalistas, setIndicadoresFundamentalistas] = useState({});
  
  // Refs para controle
  const ultimaRequisicaoRef = useRef(null);
  const cronometroIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  // ===== VERIFICAR SE MERCADO ESTÁ ABERTO =====
  const verificarMercadoAberto = useCallback(() => {
    const agora = new Date();
    const hora = agora.getHours();
    const diaSemana = agora.getDay();
    
    // Fim de semana (Sábado = 6, Domingo = 0)
    if (diaSemana === 0 || diaSemana === 6) {
      return false;
    }
    
    // Horário de funcionamento
    return hora >= HORARIO_ABERTURA && hora < HORARIO_FECHAMENTO;
  }, []);

  // ===== CÁLCULO DE PREÇO MÉDIO =====
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

  // ===== BUSCAR PREÇOS DA BRAPI =====
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
            console.log(`✅ ${chaveLimpa}: R$ ${precos[chaveLimpa]}`);
          }
        });
      }
      
      return precos;
    } catch (error) {
      console.error('❌ Erro ao buscar preços da Brapi:', error);
      return {};
    }
  }, []);

  // ===== ATUALIZAR PREÇOS (APENAS SE POSSÍVEL) =====
  const atualizarPrecos = useCallback(async (force = false) => {
    // Verificar se mercado está aberto (exceto se for força manual)
    if (!force) {
      const aberto = verificarMercadoAberto();
      if (!aberto) {
        console.log('⏰ Mercado fechado. Atualização automática suspensa.');
        return;
      }
    }
    
    // Verificar se já passou 15 minutos desde a última atualização
    if (!force && ultimaRequisicaoRef.current) {
      const agora = Date.now();
      const diff = agora - ultimaRequisicaoRef.current;
      if (diff < INTERVALO_MS - 5000) { // 5 segundos de margem
        const restante = Math.ceil((INTERVALO_MS - diff) / 1000);
        console.log(`⏳ Aguardando ${restante}s para próxima atualização`);
        return;
      }
    }
    
    if (!tickets || tickets.length === 0) {
      return;
    }
    
    if (isCronRunning) {
      console.log('⏳ Atualização já em andamento...');
      return;
    }
    
    setIsCronRunning(true);
    ultimaRequisicaoRef.current = Date.now();
    
    try {
      const tickers = tickets.map(t => t.ticker);
      console.log(`🚀 Iniciando atualização de preços para ${tickers.length} ativos...`);
      
      const precos = await buscarPrecosBrapi(tickers);
      
      if (Object.keys(precos).length === 0) {
        console.log('⚠️ Nenhum preço obtido da Brapi');
        return;
      }
      
      setPrecosAtuais(precos);
      setUltimaAtualizacao(new Date());
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));
      
      // Salvar logs de preços no Supabase
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
        console.log(`✅ ${logsNovos.length} logs salvos com sucesso!`);
      }
      
      // Buscar valuations atualizadas
      const resVal = await fetch(`${SB_URL}/rest/v1/finance_asset_valuation?order=ticker.asc`, { 
        method: 'GET', 
        headers: SB_HDR 
      });
      if (resVal.ok) {
        const dataVal = await resVal.json();
        setValuations(Array.isArray(dataVal) ? dataVal : []);
      }
      
      // Reset do cronômetro
      setTempoRestante(`${String(INTERVALO_MINUTOS).padStart(2, '0')}:00`);
      
      console.log(`✅ Preços atualizados para ${Object.keys(precos).length} ativos`);
      if (force) {
        showToast(`✅ Preços atualizados manualmente para ${Object.keys(precos).length} ativos`, 'success');
      }
    } catch (err) {
      console.error('❌ Erro ao atualizar preços:', err);
      if (force) {
        showToast('❌ Erro ao atualizar preços: ' + err.message, 'error');
      }
    } finally {
      setIsCronRunning(false);
    }
  }, [tickets, buscarPrecosBrapi, verificarMercadoAberto, isCronRunning]);

  // ===== CARREGAR DADOS DO BANCO (SEM CHAMAR BRAPI) =====
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

      // Carregar metas de setores
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
      
      console.log(`✅ Dados carregados: ${dataTickets.length} tickets, ${dataTx.length} transações`);

      // CARREGAR PREÇOS DO BANCO (ÚLTIMO LOG DE CADA TICKER)
      if (dataTickets && dataTickets.length > 0 && dataLogs && dataLogs.length > 0) {
        const precosDoBanco = {};
        dataTickets.forEach(t => {
          const tkr = t.ticker.toUpperCase();
          // Buscar último preço do log
          const ultimoLog = dataLogs.find(l => l.ticker.toUpperCase() === tkr);
          if (ultimoLog && ultimoLog.preco) {
            precosDoBanco[tkr] = parseFloat(ultimoLog.preco);
          }
        });
        
        if (Object.keys(precosDoBanco).length > 0) {
          setPrecosAtuais(precosDoBanco);
          console.log(`✅ ${Object.keys(precosDoBanco).length} preços carregados do banco`);
        }
      }

    } catch (err) {
      console.error('❌ Erro ao carregar dados:', err);
      showToast("Erro na sincronização: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // ===== INICIALIZAÇÃO =====
  useEffect(() => { 
    carregarDados(); 
  }, [carregarDados]);

  // ===== VERIFICAR MERCADO E INICIAR CRONÔMETRO =====
  useEffect(() => {
    const verificarStatusMercado = () => {
      const aberto = verificarMercadoAberto();
      setIsMercadoAberto(aberto);
      return aberto;
    };

    // Função para iniciar o cronômetro regressivo
    const iniciarCronometro = () => {
      if (cronometroIntervalRef.current) {
        clearInterval(cronometroIntervalRef.current);
      }

      // Calcular tempo restante baseado na última atualização
      let segundosRestantes = INTERVALO_MINUTOS * 60;
      
      if (ultimaRequisicaoRef.current) {
        const agora = Date.now();
        const diff = (agora - ultimaRequisicaoRef.current) / 1000;
        if (diff < INTERVALO_MINUTOS * 60) {
          segundosRestantes = Math.max(0, (INTERVALO_MINUTOS * 60) - diff);
        }
      }

      cronometroIntervalRef.current = setInterval(() => {
        if (!isCronRunning && isMercadoAberto) {
          segundosRestantes--;
          
          if (segundosRestantes <= 0) {
            // Tentar atualizar automaticamente
            if (isMercadoAberto) {
              atualizarPrecos(false);
            }
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

    // Verificar mercado ao carregar
    verificarStatusMercado();

    // Verificar mercado a cada minuto
    const mercadoInterval = setInterval(() => {
      verificarStatusMercado();
    }, 60000);

    // Iniciar cronômetro
    iniciarCronometro();

    // Atualizar preços automaticamente apenas se mercado aberto
    if (verificarMercadoAberto() && tickets.length > 0) {
      // Verificar se já passou 15 minutos desde a última atualização
      const agora = Date.now();
      if (!ultimaRequisicaoRef.current || (agora - ultimaRequisicaoRef.current) >= INTERVALO_MS) {
        // Aguardar 5 segundos para carregar tudo
        setTimeout(() => {
          if (verificarMercadoAberto()) {
            atualizarPrecos(false);
          }
        }, 5000);
      }
    }

    return () => {
      clearInterval(mercadoInterval);
      if (cronometroIntervalRef.current) {
        clearInterval(cronometroIntervalRef.current);
      }
    };
  }, [tickets, atualizarPrecos, verificarMercadoAberto, isCronRunning]);

  // ===== SUGESTÕES DE TICKER =====
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
    } catch (e) { console.error('Fallback de setor via /quote/list falhou:', e); }
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
      console.log(`Persistindo setor para ${tkrChave}: ${setorDefinido}`);
      
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
        body: JSON.stringify({ 
          ticker: tkrChave, 
          setor_nome: setorDefinido, 
          meta_grupo_percentual: pesoGrupo 
        })
      });

      const patchResponse = await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkrChave}`, {
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({ 
          setor_nome: setorDefinido, 
          meta_grupo_percentual: pesoGrupo 
        })
      });

      if (!patchResponse.ok) {
        const errorText = await patchResponse.text();
        console.error('Erro no PATCH:', errorText);
        throw new Error(`Erro ao atualizar setor: ${errorText}`);
      }

      setAtivosMeta(prev => ({
        ...prev,
        [tkrChave]: { setor: setorDefinido, metaGrupo: pesoGrupo }
      }));

      console.log(`Setor ${setorDefinido} persistido com sucesso para ${tkrChave}`);
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
      console.log(`Salvando ticket ${tkrChave} com setor: ${setorDefinido}`);
      
      if (modalId) {
        const updateResponse = await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, { 
          method: 'PATCH', 
          headers: SB_HDR, 
          body: JSON.stringify({ nome: modalNome }) 
        });
        
        if (!updateResponse.ok) {
          throw new Error('Erro ao atualizar ticket');
        }
        
        await persistirSetorAtivo(tkrChave, setorDefinido, pesoGrupoAtual);
      } else {
        const createResponse = await fetch(`${SB_URL}/rest/v1/finance_tickets`, { 
          method: 'POST', 
          headers: SB_HDR, 
          body: JSON.stringify({ 
            ticker: tkrChave, 
            nome: modalNome, 
            quantidade: 0, 
            preco_custo: 0 
          }) 
        });
        
        if (!createResponse.ok) {
          throw new Error('Erro ao criar ticket');
        }
        
        await persistirSetorAtivo(tkrChave, setorDefinido);
      }
      
      setIsModalOpen(false);
      await carregarDados();
      showToast(`Ticker ${tkrChave} sincronizado com setor: ${setorDefinido}`, 'success');
    } catch (err) { 
      console.error('Erro em salvarTicket:', err);
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
      const bodyData = { 
        ticker: tkr, 
        tipo: txTipo, 
        quantidade: qty, 
        preco: prc, 
        registrado_em: dataIso,
        setor: setorInfo
      };

      if (txId) {
        await fetch(`${SB_URL}/rest/v1/finance_transactions?id=eq.${txId}`, {
          method: 'PATCH',
          headers: SB_HDR,
          body: JSON.stringify(bodyData)
        });
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_transactions`, {
          method: 'POST',
          headers: SB_HDR,
          body: JSON.stringify(bodyData)
        });
      }

      setIsTxModalOpen(false);
      await carregarDados();
      showToast('Ordem processada com sucesso!', 'success');
    } catch (err) { 
      showToast(err.message, 'error'); 
    }
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
    } catch (err) {
      showToast(err.message, 'error');
    }
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
      
      setSetoresMeta(prev => ({
        ...prev,
        [novoSetorNome.trim()]: metaValue
      }));
      
      setNovoSetorNome('');
      setNovoSetorMeta('');
      await carregarDados();
      showToast('Novo setor adicionado com sucesso!', 'success');
    } catch (err) { 
      console.error(err);
      showToast('Erro ao adicionar setor', 'error');
    }
  };

  const atualizarSetorMetaBD = async (setor, valor) => {
    try {
      const novoValor = parseFloat(valor) || 0;
      
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ nome: setor, meta_percentual: novoValor })
      });
      
      setSetoresMeta(prev => ({
        ...prev,
        [setor]: novoValor
      }));
    } catch (err) { 
      console.error(err);
      showToast('Erro ao atualizar meta do setor', 'error');
    }
  };

  const removerSetor = async (setor) => {
    if (!confirm(`Remover permanentemente o setor "${setor}"?`)) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors?nome=eq.${setor}`, { method: 'DELETE', headers: SB_HDR });
      setSetoresMeta(prev => {
        const newState = { ...prev };
        delete newState[setor];
        return newState;
      });
      await carregarDados();
      showToast(`Setor ${setor} removido`, 'success');
    } catch (e) { 
      console.error(e);
      showToast('Erro ao remover setor', 'error');
    }
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
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({ setor_nome: setorFinal, meta_grupo_percentual: mGrupo })
      });
      
      setAtivosMeta(prev => ({
        ...prev,
        [tkr]: { setor: setorFinal, metaGrupo: mGrupo }
      }));
      
      showToast(`Setor de ${tkr} atualizado para ${setorFinal}`, 'success');
    } catch (e) { 
      console.error(e); 
      showToast("Erro ao salvar setor no banco de dados.", "error");
    }
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

  // ===== CÁLCULO DE PATRIMÔNIO =====
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

  // ===== RESUMO POR CATEGORIAS =====
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
        if (!mapa[setor]) {
          mapa[setor] = { setor, metaPct: setoresMeta[setor] || 0, realValor: 0 };
        }
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

  // ===== GRÁFICOS =====
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

  const getValuationsPorTicker = (ticker) => {
    return valuations.filter(v => v.ticker.toUpperCase() === ticker.toUpperCase());
  };

  const getMetodologiaRecomendada = (setor) => {
    const rule = sectorRules.find(r => r.setor === setor);
    return rule?.metodologia_recomendada || 'Bazin';
  };

  // ===== EXECUTAR ATUALIZAÇÃO MANUAL (FORÇADA) =====
  const ejecutarCronVerificacao = async () => {
    if (!verificarMercadoAberto()) {
      showToast('⚠️ Mercado fechado. Atualização manual disponível apenas durante o pregão.', 'warning');
      return;
    }
    
    // Verificar se já passou 15 minutos desde a última atualização
    if (ultimaRequisicaoRef.current) {
      const agora = Date.now();
      const diff = agora - ultimaRequisicaoRef.current;
      if (diff < INTERVALO_MS - 10000) {
        const restante = Math.ceil((INTERVALO_MS - diff) / 60000);
        showToast(`⏳ Aguarde ${restante} minuto(s) para nova atualização`, 'warning');
        return;
      }
    }
    
    await atualizarPrecos(true);
  };

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
            <span className="text-[10px] text-slate-500 font-mono">
              Última: {lastCheckTime}
            </span>
            <span className={`text-[11px] font-mono font-bold ${isCronRunning ? 'text-blue-400 animate-pulse' : isMercadoAberto ? 'text-emerald-400' : 'text-red-400'}`}>
              ⏱️ {isMercadoAberto ? (isCronRunning ? 'Atualizando...' : tempoRestante) : '🔒 Fechado'}
            </span>
          </div>
        </div>
      </header>

      {/* O RESTO DO CÓDIGO PERMANECE IGUAL - MANTENHA A MESMA ESTRUTURA DA VERSÃO ANTERIOR */}
      {/* ... (todo o resto do código permanece igual) ... */}
      
      {/* ATENÇÃO: O RESTO DO CÓDIGO (modais, tabelas, gráficos, etc) PERMANECE IGUAL À VERSÃO ANTERIOR */}
      {/* Não vou repetir todo o código para não estourar o limite, mas mantenha a mesma estrutura */}
      
    </div>
  );
}
