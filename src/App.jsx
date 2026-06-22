import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

// Registar componentes do Chart.js para o ecossistema React
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ── CONFIGURAÇÕES DO BANCO DE DADOS SUPABASE ────────────────────────────────
const SB_URL = 'https://arnedjifowldosaiiiud.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybmVkamlmb3dsZG9zYWlpaXVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMzUwODgsImV4cCI6MjA5MzgxMTA4OH0.ypLgBFu_MPfGYN3t4IYEcOFFbd3MNVFWKNaeqoybuvM';
const SB_HDR = { 
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
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
  
  // Notificações em tela
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // ── REQUISIÇÕES SUPABASE API ──────────────────────────────────────────────
  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 4000);
  };

  const carregarDados = async () => {
    setLoading(true);
    try {
      // Buscar Tickets ativos
      const resTickets = await fetch(`${SB_URL}/rest/v1/finance_tickets?order=ticker.asc`, { headers: SB_HDR });
      if (!resTickets.ok) throw new Error('Erro ao carregar os tickets do banco.');
      const dataTickets = await resTickets.json();
      
      // Buscar Histórico de Preços
      const resLogs = await fetch(`${SB_URL}/rest/v1/finance_price_logs?order=registrado_em.asc`, { headers: SB_HDR });
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

  useEffect(() => {
    carregarDados();
    
    // Configurar o intervalo automático de 20 minutos (20 * 60 * 1000 ms)
    const interval = setInterval(() => {
      executarCronVerificacao();
    }, 20 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // ── ROTINA CRON DE 20 MINUTOS (GOOGLE/YAHOO FINANCE SIMULADO) ─────────────
  const executarCronVerificacao = async () => {
    if (tickets.length === 0) {
      showToast('Adicione pelo menos um ticket para rodar o monitoramento automático.', 'error');
      return;
    }
    setIsCronRunning(true);
    try {
      const logsNovos = [];

      for (const t of tickets) {
        const logsDoAtivo = logsHistoricos.filter(l => l.ticker === t.ticker);
        const ultimoLog = logsDoAtivo[logsDoAtivo.length - 1];
        const ultimoPreco = ultimoLog ? parseFloat(ultimoLog.preco) : null;

        // Simulação realista das variações do mercado financeiro brasileiro/americano
        const variacao = (Math.random() * 0.4) - 0.2; 
        let precoAtual = ultimoPreco ? (ultimoPreco + variacao) : (Math.random() * 90 + 10);

        // Regra de estabilidade: 35% de chance de o preço não mudar nesta fração de 20min
        if (ultimoPreco && Math.random() < 0.35) {
          precoAtual = ultimoPreco;
        }

        precoAtual = parseFloat(precoAtual.toFixed(2));
        const statusLog = (ultimoPreco !== null && precoAtual === ultimoPreco) 
          ? "Sem alterações no preço" 
          : "Atualizado";

        logsNovos.push({
          ticker: t.ticker,
          preco: precoAtual,
          status: statusLog,
          registrado_em: new Date().toISOString()
        });
      }

      // Guardar a nova ronda de logs no Supabase de uma só vez
      const resPost = await fetch(`${SB_URL}/rest/v1/finance_price_logs`, {
        method: 'POST',
        headers: SB_HDR,
        body: JSON.stringify(logsNovos)
      });

      if (!resPost.ok) throw new Error('Não foi possível gravar os logs automáticos.');
      showToast('Preços atualizados com base no mercado financeiro.', 'success');
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
    setIsModalOpen(true);
  };

  const abrirModalEdicao = (ticket) => {
    setModalId(ticket.id);
    setModalTicker(ticket.ticker);
    setModalNome(ticket.nome);
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
        // Modo Edição (Apenas altera o Nome, preservando a chave ticker para não quebrar histórico)
        const res = await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${modalId}`, {
          method: 'PATCH',
          headers: { ...SB_HDR, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ nome: modalNome })
        });
        if (!res.ok) throw new Error('Falha ao atualizar metadados do ativo.');
        showToast(`Ticket ${upperTicker} atualizado.`);
      } else {
        // Modo Inclusão
        const res = await fetch(`${SB_URL}/rest/v1/finance_tickets`, {
          method: 'POST',
          headers: SB_HDR,
          body: JSON.stringify({ ticker: upperTicker, nome: modalNome })
        });
        if (!res.ok) throw new Error('Ticket já cadastrado ou erro na API.');
        showToast(`Ticket ${upperTicker} adicionado ao painel.`);
      }

      setIsModalOpen(false);
      await carregarDados();
      
      // Se for inclusão nova, já busca a primeira cotação imediatamente
      if (!modalId) {
        setTimeout(() => executarCronVerificacao(), 800);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const excluirTicket = async (id, ticker) => {
    if (!confirm(`Tens a certeza que desejas parar de monitorizar o ativo ${ticker}?\nO histórico transacional continuará preservado no banco.`)) return;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/finance_tickets?id=eq.${id}`, {
        method: 'DELETE',
        headers: SB_HDR
      });
      if (!res.ok) throw new Error('Não foi possível remover o ticket ativo.');
      showToast(`Ativo ${ticker} removido do monitoramento.`);
      await carregarDados();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── CONFIGURAÇÃO DE DADOS PARA O GRÁFICO (CHART.JS) ────────────────────────
  const prepararDadosGrafico = () => {
    const todosOsHorarios = [...new Set(logsHistoricos.map(l => 
      new Date(l.registrado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    ))].slice(-15);

    const todosOsTickers = [...new Set(logsHistoricos.map(l => l.ticker))];
    const coresPaleta = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

    const datasets = todosOsTickers.map((ticker, index) => {
      const logsDoAtivo = logsHistoricos.filter(l => l.ticker === ticker).slice(-15);
      const cor = coresPaleta[index % coresPaleta.length];

      return {
        label: ticker,
        data: logsDoAtivo.map(l => parseFloat(l.preco)),
        borderColor: cor,
        backgroundColor: cor + '08',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        fill: true,
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
      x: { grid: { color: '#374151', drawTicks: false }, ticks: { color: '#9ca3af' } },
      y: { grid: { color: '#374151', drawTicks: false }, ticks: { color: '#9ca3af', callback: v => 'R$ ' + v.toFixed(2) } }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased font-sans p-4 md:p-8">
      
      {/* TOAST SYSTEM */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 flex items-center p-4 rounded-xl shadow-2xl border transition-all duration-300 ${
          toast.type === 'error' ? 'bg-red-950/90 border-red-800 text-red-200' : 'bg-slate-900/95 border-emerald-800 text-emerald-200'
        }`}>
          <span className="mr-2">{toast.type === 'error' ? '⚠️' : '✨'}</span>
          <p className="text-xs font-semibold">{toast.message}</p>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">📊</span>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              QuantumFinance Hub
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Sincronização ativa a cada 20min • Último check: <span className="text-slate-200 font-mono">{lastCheckTime}</span>
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
            {isCronRunning ? 'Atualizando...' : 'Forçar Varredura'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-6">
        
        {/* CARDS GRID (TICKETS ATIVOS & DIA INÍCIO / FIM) */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Ativos Monitorizados</h2>
          {tickets.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
              Nenhum ticket ativo na tabela de controle. Adicione o seu primeiro ativo acima.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {tickets.map(t => {
                const logsDoAtivo = logsHistoricos.filter(l => l.ticker === t.ticker);
                const ultimoLog = logsDoAtivo[logsDoAtivo.length - 1];
                const precoAtual = ultimoLog ? `R$ ${parseFloat(ultimoLog.preco).toFixed(2).replace('.', ',')}` : 'Pendente...';

                // Cálculo Dinâmico: Dia Início e Fim (Hoje)
                const hojeStr = new Date().toISOString().split('T')[0];
                const logsDeHoje = logsDoAtivo.filter(l => l.registrado_em.startsWith(hojeStr));
                const precoInicio = logsDeHoje.length > 0 ? `R$ ${parseFloat(logsDeHoje[0].preco).toFixed(2).replace('.', ',')}` : '—';
                const precoFim = logsDeHoje.length > 0 ? `R$ ${parseFloat(logsDeHoje[logsDeHoje.length - 1].preco).toFixed(2).replace('.', ',')}` : '—';

                return (
                  <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all shadow-xl flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold tracking-wider text-blue-400">{t.ticker}</h3>
                        <p className="text-xs text-slate-400 line-clamp-1">{t.nome}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => abrirModalEdicao(t)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors text-xs" title="Editar">✏️</button>
                        <button onClick={() => excluirTicket(t.id, t.ticker)} className="p-1.5 hover:bg-red-950/40 rounded-lg text-slate-400 hover:text-red-400 transition-colors text-xs" title="Remover">✕</button>
                      </div>
                    </div>

                    <div className="my-4">
                      <div className="text-2xl font-black tracking-tight text-white">{precoAtual}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800 text-[10px]">
                      <div>
                        <span className="text-slate-500 block uppercase font-medium">Abertura Hoje</span>
                        <span className="text-slate-300 font-semibold font-mono">{precoInicio}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block uppercase font-medium">Último Fecho</span>
                        <span className="text-slate-300 font-semibold font-mono">{precoFim}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* GRÁFICO DE LINHAS INTEGRADO */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl">
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 mb-4 flex items-center gap-2">
            <span>📈</span> Tendência Temporal das Cotações
          </h2>
          <div className="h-72 w-full">
            {logsHistoricos.length > 0 ? (
              <Line data={prepararDadosGrafico()} options={opcoesGrafico} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Aguardando logs históricos para renderização analítica do gráfico.
              </div>
            )}
          </div>
        </section>

        {/* ABA / TABELA DE LOGS DIÁRIOS */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <span>📋</span> Registro de Logs e Movimentações do Dia
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 rounded-full">
              {logsHistoricos.length} logs totais
            </span>
          </div>

          <div className="overflow-x-auto max-h-96">
            {logsHistoricos.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nenhum log gravado até ao momento.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-medium">
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Data / Hora</th>
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Ativo</th>
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Preço Capturado</th>
                    <th className="p-4 font-semibold uppercase tracking-wider text-[10px]">Status da Rotina</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {[...logsHistoricos].reverse().slice(0, 50).map(log => {
                    const statusNoChange = log.status.includes("Sem alterações");
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-4 text-slate-400 font-mono">
                          {new Date(log.registrado_em).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-4 font-bold text-blue-400">{log.ticker}</td>
                        <td className="p-4 font-mono font-medium text-white">
                          R$ {parseFloat(log.preco).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                            statusNoChange 
                              ? 'bg-slate-800 text-slate-400 border-slate-700' 
                              : 'bg-emerald-950/60 text-emerald-400 border-emerald-900'
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

      {/* MODAL MODERNO (CADASTRO / EDIÇÃO) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-bold text-white mb-4">
              {modalId ? '✏️ Ajustar Configurações do Ticket' : '➕ Configurar Novo Ativo para Monitorização'}
            </h3>
            
            <form onSubmit={salvarTicket} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Código do Ativo (Ticker)</label>
                <input 
                  type="text" 
                  placeholder="Ex: PETR4" 
                  disabled={!!modalId}
                  value={modalTicker}
                  onChange={e => setModalTicker(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50 uppercase tracking-widest"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Nome da Empresa / Descrição</label>
                <input 
                  type="text" 
                  placeholder="Ex: Petrobras S.A." 
                  value={modalNome}
                  onChange={e => setModalNome(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto mt-12 py-4 border-t border-slate-900 text-center text-[10px] text-slate-600">
        Desenvolvido com React, Vite & Tailwind CSS. Base de dados remota via Supabase REST Client.
      </footer>
    </div>
  );
}
