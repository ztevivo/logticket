import React, { useState, useEffect, useCallback } from 'react';
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

// Metodologias disponíveis
const METODOLOGIAS = [
  { id: 'bazin', label: 'Bazin', desc: 'DY / 6%' },
  { id: 'gordon', label: 'Gordon', desc: 'Dividendos + Crescimento' },
  { id: 'graham', label: 'Graham', desc: 'Valor Intrínseco' },
  { id: 'barsi', label: 'Barsi', desc: 'Dividend Yield' },
  { id: 'fluxo_caixa', label: 'Fluxo de Caixa', desc: 'Fluxo de Caixa Descontado' }
];

export default function App() {
  const [abaAtiva, setAbaAtiva] = useState('home');
  const [tickets, setTickets] = useState([]);
  const [transacoes, setTransacoes] = useState([]);
  const [valuations, setValuations] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [sectorRules, setSectorRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState('Nunca verificado');
  
  // Modal states
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
  const [txSetor, setTxSetor] = useState('');

  // Valuation modal
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

  // Métricas calculadas
  const [posicoesAtivos, setPosicoesAtivos] = useState({});

  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  // Função para recalcular posição via SQL (mais confiável)
  const recalcularPosicaoAtivo = useCallback(async (ticker) => {
    try {
      const response = await fetch(
        `${SB_URL}/rest/v1/rpc/calcular_posicao_ativo?ticker=eq.${ticker}`,
        { method: 'GET', headers: SB_HDR }
      );
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          return data[0];
        }
      }
      return null;
    } catch (error) {
      console.error('Erro ao recalcular posição:', error);
      return null;
    }
  }, []);

  // Função para recalcular todos os ativos
  const recalcularTodosAtivos = useCallback(async () => {
    try {
      await fetch(
        `${SB_URL}/rest/v1/rpc/recalcular_todos_ativos`,
        { method: 'POST', headers: SB_HDR }
      );
    } catch (error) {
      console.error('Erro ao recalcular todos os ativos:', error);
    }
  }, []);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      // Carregar tickets
      const resTickets = await fetch(`${SB_URL}/rest/v1/finance_tickets?order=ticker.asc`, { method: 'GET', headers: SB_HDR });
      const dataTickets = await resTickets.json();
      
      // Carregar transações com preço médio
      const resTx = await fetch(`${SB_URL}/rest/v1/finance_transactions?order=registrado_em.desc`, { method: 'GET', headers: SB_HDR });
      const dataTx = await resTx.json();

      // Carregar valuations
      const resVal = await fetch(`${SB_URL}/rest/v1/finance_asset_valuation?order=ticker.asc`, { method: 'GET', headers: SB_HDR });
      const dataVal = await resVal.json();

      // Carregar indicadores
      const resInd = await fetch(`${SB_URL}/rest/v1/finance_asset_indicators?order=ticker.asc`, { method: 'GET', headers: SB_HDR });
      const dataInd = await resInd.json();

      // Carregar regras de setor
      const resRules = await fetch(`${SB_URL}/rest/v1/finance_sector_rules`, { method: 'GET', headers: SB_HDR });
      const dataRules = await resRules.json();

      // Carregar metas
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
                  metaGrupo: parseFloat(a.meta_group_percentual || 0) 
                };
              }
            });
          }
        }
      } catch (e) { console.error("Erro ao carregar metas de ativos:", e); }

      setTickets(Array.isArray(dataTickets) ? dataTickets : []);
      setTransacoes(Array.isArray(dataTx) ? dataTx : []);
      setValuations(Array.isArray(dataVal) ? dataVal : []);
      setIndicators(Array.isArray(dataInd) ? dataInd : []);
      setSectorRules(Array.isArray(dataRules) ? dataRules : []);
      setSetoresMeta(mapeamentoSetores);
      setAtivosMeta(mapeamentoAtivos);
      setLastCheckTime(new Date().toLocaleTimeString('pt-BR'));

      // Recalcular posições para consistência
      await recalcularTodosAtivos();

    } catch (err) {
      console.error(err);
      showToast("Erro na sincronização: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [recalcularTodosAtivos]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Efeito para sugestões de ticker
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
      let nomeCompleto = '';
      let setorExtraido = '';

      if (res.ok) {
        const data = await res.json();
        if (data && data.results && data.results[0]) {
          const ativoObjeto = data.results[0];
          nomeCompleto = ativoObjeto.longName || ativoObjeto.shortName || 'Empresa Cadastrada';

          setorExtraido =
            ativoObjeto.summaryProfile?.sector ||
            ativoObjeto.summaryProfile?.sectorDisp ||
            ativoObjeto.summaryProfile?.industry ||
            ativoObjeto.summaryProfile?.industryDisp ||
            ativoObjeto.sector ||
            ativoObjeto.industry ||
            ativoObjeto.segment ||
            '';
        }
      }

      if (!setorExtraido) {
        setorExtraido = await buscarSetorFallbackViaLista(limpo);
      }

      if (!setorExtraido) {
        setorExtraido = inferirSetorPorSufixo(limpo);
      }

      if (nomeCompleto) setModalNome(nomeCompleto);
      setModalSetorAuto(setorExtraido);
    } catch (e) {
      console.error(e);
      setModalSetorAuto(inferirSetorPorSufixo(limpo));
    }
    finally { setLoadingSugestoes(false); }
  };

  const abrirModalEditarTicket = async (id, ticker, nomeAtual) => {
    setModalId(id);
    setModalTicker(ticker.toUpperCase());
    setModalNome(nomeAtual);
    setModalSetorAuto('');
    setIsModalOpen(true);
    await selecionarSugestao(ticker);
  };

  const persistirSetorAtivo = async (tkrChave, setorDefinido, pesoGrupoExistente = null) => {
    await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
      method: 'POST',
      headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ nome: setorDefinido, meta_percentual: 0 })
    });

    const pesoGrupo = (pesoGrupoExistente !== null && pesoGrupoExistente !== undefined) ? pesoGrupoExistente : 100;

    await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
      method: 'POST',
      headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ ticker: tkrChave, setor_nome: setorDefinido, meta_group_percentual: pesoGrupo })
    });

    await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkrChave}`, {
      method: 'PATCH',
      headers: SB_HDR,
      body: JSON.stringify({ setor_nome: setorDefinido, meta_group_percentual: pesoGrupo })
    });
  };

  const salvarTicket = async (e) => {
    e.preventDefault();
    if (!modalTicker.trim() || !modalNome.trim()) return;
    const tkrChave = modalTicker.trim().toUpperCase();
    const setorDefinido = modalSetorAuto || 'Outros / Não Classificado';
    const pesoGrupoAtual = ativosMeta[tkrChave]?.metaGrupo;

    try {
      if (modalId) {
        await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, { 
          method: 'PATCH', 
          headers: SB_HDR, 
          body: JSON.stringify({ nome: modalNome }) 
        });
        await persistirSetorAtivo(tkrChave, setorDefinido, pesoGrupoAtual);
      } else {
        await fetch(`${SB_URL}/rest/v1/finance_tickets`, { 
          method: 'POST', 
          headers: SB_HDR, 
          body: JSON.stringify({ ticker: tkrChave, nome: modalNome, quantidade: 0, preco_custo: 0 }) 
        });
        await persistirSetorAtivo(tkrChave, setorDefinido);
      }
      setIsModalOpen(false);
      await carregarDados();
      showToast(`Ticker ${tkrChave} sincronizado no hub.`, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const excluirTicket = async (id, ticker) => {
    const confirmacao = window.confirm(`⚠️ ATENÇÃO EXCLUSÃO:\nVocê tem certeza de que deseja remover permanentemente o painel de monitoramento do ativo ${ticker.toUpperCase()}? Esta ação não pode ser desfeita.`);
    if (!confirmacao) return;

    try {
      await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, { method: 'DELETE', headers: SB_HDR });
      await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${ticker.toUpperCase()}`, { method: 'DELETE', headers: SB_HDR });
      await carregarDados();
      showToast(`Ativo ${ticker.toUpperCase()} removido com sucesso.`);
    } catch (err) { showToast(err.message, 'error'); }
  };

  // ===== TRANSAÇÕES =====
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
      setTxSetor(txExistente.setor || '');
    } else {
      setTxId('');
      setTxTicker(tickerPredefinido || (tickets[0]?.ticker || ''));
      setTxTipo('COMPRA');
      setTxQuantidade('');
      setTxPreco('');
      setTxData(new Date().toISOString().split('T')[0]);
      setTxSetor('');
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
      // Buscar setor do ativo
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
      
      // Recalcular posição do ativo
      const posicao = await recalcularPosicaoAtivo(tkr);
      
      if (posicao) {
        await fetch(`${SB_URL}/rest/v1/finance_tickets?ticker=eq.${tkr}`, {
          method: 'PATCH',
          headers: SB_HDR,
          body: JSON.stringify({ 
            quantidade: posicao.quantidade_total || 0, 
            preco_custo: posicao.preco_medio || 0 
          })
        });
      }

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
      
      // Recalcular posição
      const posicao = await recalcularPosicaoAtivo(ticker);
      if (posicao) {
        await fetch(`${SB_URL}/rest/v1/finance_tickets?ticker=eq.${ticker}`, {
          method: 'PATCH',
          headers: SB_HDR,
          body: JSON.stringify({ 
            quantidade: posicao.quantidade_total || 0, 
            preco_custo: posicao.preco_medio || 0 
          })
        });
      }
      
      await carregarDados();
      showToast('Lançamento removido permanentemente.');
    } catch (e) { showToast(e.message, 'error'); }
  };

  // ===== VALUATIONS =====
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

  // ===== METAS =====
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
      showToast('Novo setor acoplado ao ecossistema.', 'success');
    } catch (err) { console.error(err); }
  };

  const atualizarSetorMetaBD = async (setor, valor) => {
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ nome: setor, meta_percentual: parseFloat(valor) || 0 })
      });
      setSetoresMeta(p => ({ ...p, [setor]: parseFloat(valor) || 0 }));
    } catch (err) { console.error(err); }
  };

  const removerSetor = async (setor) => {
    if (!confirm(`Remover permanentemente o setor "${setor}"?`)) return;
    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_sectors?nome=eq.${setor}`, { method: 'DELETE', headers: SB_HDR });
      await carregarDados();
    } catch (e) { console.error(e); }
  };

  const vincularAtivoAoSetorBD = async (ticker, setor, metaGrupo) => {
    const tkr = ticker.toUpperCase();
    const mGrupo = parseFloat(metaGrupo) || 0;
    const setorFinal = setor || SETOR_PADRAO;
    
    setAtivosMeta(p => ({
      ...p,
      [tkr]: { setor: setorFinal, metaGrupo: mGrupo }
    }));

    try {
      await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
        method: 'POST',
        headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ ticker: tkr, setor_nome: setorFinal, meta_group_percentual: mGrupo })
      });
      
      await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkr}`, {
        method: 'PATCH',
        headers: SB_HDR,
        body: JSON.stringify({ setor_nome: setorFinal, meta_group_percentual: mGrupo })
      });
      
      showToast(`Setor de ${tkr} redefinido com sucesso!`);
    } catch (e) { 
      console.error(e); 
      showToast("Erro ao salvar setor no banco de dados.", "error");
    }
  };

  // ===== MÉTRICAS =====
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

  // Calcular patrimônio total e posições
  const totalPatrimonioReal = Array.isArray(tickets) ? tickets.reduce((acc, t) => {
    if (!t) return acc;
    const qtd = parseFloat(t.quantidade || 0);
    const precoMedio = parseFloat(t.preco_custo || 0);
    return acc + (qtd * precoMedio);
  }, 0) : 0;

  // Buscar preço atual para cada ativo (do último log)
  const getPrecoAtual = (ticker) => {
    // Buscar do valuation ou do preço médio como fallback
    return parseFloat(ticker.preco_custo || 0);
  };

  // Buscar preços teto por ticker
  const getValuationsPorTicker = (ticker) => {
    return valuations.filter(v => v.ticker.toUpperCase() === ticker.toUpperCase());
  };

  // Buscar metodologia recomendada por setor
  const getMetodologiaRecomendada = (setor) => {
    const rule = sectorRules.find(r => r.setor === setor);
    return rule?.metodologia_recomendada || 'Bazin';
  };

  // Resumo por categorias
  const resumoCategorias = (() => {
    const mapa = {};

    Object.keys(setoresMeta).forEach(setor => {
      mapa[setor] = { setor, metaPct: setoresMeta[setor] || 0, realValor: 0 };
    });

    (Array.isArray(tickets) ? tickets : []).forEach(t => {
      if (!t) return;
      const tkr = t.ticker.toUpperCase();
      const qtd = parseFloat(t.quantidade || 0);
      const preco = parseFloat(t.preco_custo || 0);
      const valorReal = qtd * preco;

      const setor = normalizarSetor(ativosMeta[tkr]?.setor);
      if (!mapa[setor]) mapa[setor] = { setor, metaPct: setoresMeta[setor] || 0, realValor: 0 };
      mapa[setor].realValor += valorReal;
    });

    return Object.values(mapa).sort((a, b) => b.metaPct - a.metaPct);
  })();

  const totalMetaPct = resumoCategorias.reduce((acc, c) => acc + c.metaPct, 0);

  const ativosAgrupadosPorSetor = (() => {
    const grupos = {};
    Object.keys(setoresMeta).forEach(s => { grupos[s] = []; });

    (Array.isArray(tickets) ? tickets : []).forEach(t => {
      if (!t) return;
      const tkr = t.ticker.toUpperCase();
      const info = ativosMeta
