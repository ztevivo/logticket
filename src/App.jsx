const persistirSetorAtivo = async (tkrChave, setorDefinido, pesoGrupoExistente = null) => {
    // 1) Garante que a categoria exista SEM resetar a meta_percentual
    // Removemos 'meta_percentual: 0' do corpo para evitar overwrite.
    // O POST com merge-duplicates apenas insere se não existir.
    await fetch(`${SB_URL}/rest/v1/finance_target_sectors`, {
      method: 'POST',
      headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ nome: setorDefinido })
    });

    const pesoGrupo = (pesoGrupoExistente !== null && pesoGrupoExistente !== undefined) ? pesoGrupoExistente : 100;

    // 2) Insere o vínculo do ativo
    await fetch(`${SB_URL}/rest/v1/finance_target_assets`, {
      method: 'POST',
      headers: { ...SB_HDR, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ ticker: tkrChave, setor_nome: setorDefinido, meta_group_percentual: pesoGrupo })
    });

    // 3) Patch para garantir que a categoria (setor_nome) seja atualizada no registro existente
    await fetch(`${SB_URL}/rest/v1/finance_target_assets?ticker=eq.${tkrChave}`, {
      method: 'PATCH',
      headers: SB_HDR,
      body: JSON.stringify({ setor_nome: setorDefinido, meta_group_percentual: pesoGrupo })
    });
    
    // Atualização reativa do estado para o Front-end não ficar "Outros"
    setAtivosMeta(prev => ({
      ...prev,
      [tkrChave]: { setor: setorDefinido, metaGrupo: pesoGrupo }
    }));
  };

  const salvarTicket = async (e) => {
    e.preventDefault();
    if (!modalTicker.trim() || !modalNome.trim()) return;
    
    const tkrChave = modalTicker.trim().toUpperCase();
    // Prioriza o setor inferido automaticamente, se houver
    const setorDefinido = modalSetorAuto && modalSetorAuto !== 'Outros / Não Classificado' 
      ? modalSetorAuto 
      : (ativosMeta[tkrChave]?.setor || 'Outros / Não Classificado');
      
    const pesoGrupoAtual = ativosMeta[tkrChave]?.metaGrupo;

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
          body: JSON.stringify({ ticker: tkrChave, nome: modalNome, quantidade: 0, preco_custo: 0 }) 
        });
      }
      
      // Persiste o setor após salvar o ticket
      await persistirSetorAtivo(tkrChave, setorDefinido, pesoGrupoAtual);
      
      setIsModalOpen(false);
      await carregarDados(); // Atualiza tudo
      showToast(`Ticker ${tkrChave} atualizado e classificado em "${setorDefinido}".`, 'success');
    } catch (err) { 
      showToast(err.message, 'error'); 
    }
  };
