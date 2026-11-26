(function () {
  'use strict';
  const actions = new Set([
    'submit_report','submit_stock_report','submit_price','submit_context_take','vote_matchup','vote_court',
    'rate_place','save_discovery','mark_trail_stop','report_content','report_discovery','set_user_block',
    'appeal_strike','my_strikes','my_wave_profile','my_discoveries','respond_take'
  ]);
  const screens = new Set(['my_taste_follows','set_follow','nominate_court_case','suggest_court_location','submit_discovery_trail']);
  const publicReads = new Set([
    'place_status_snapshot','product_stock_snapshot','product_allergen_evidence','place_screen','price_ledger','price_targets',
    'discovery_targets','matchups','court_cases','court_ruling_history','court_locations','court_takes','find_tastes','taste_profile',
    'weekly_matchups','search_places','place_information_for','participation_runtime_entry','list_trails'
  ]);
  const requests = new Map();

  async function action(player, person, operation, parameters) {
    const data = {...parameters};
    const supplied = data.p_request;
    delete data.p_request;
    const key = JSON.stringify([person.participant, operation, data]);
    const request = supplied || requests.get(key) || crypto.randomUUID();
    if (requests.size >= 100) requests.delete(requests.keys().next().value);
    requests.set(key, request);
    const result = await player.api('action', {operation, request, data}, true, person.participant);
    requests.delete(key);
    return result;
  }

  // Read-only safety tools use the active player even after a posting restriction.
  window.NuggetfinderScopedApp = function (publicClient, onUser) {
    const player = window.NuggetfinderParticipant;
    function update() {
      const person = player.current();
      onUser(person ? {id:person.participant, handle:person.pseudonym, scoped:true} : null);
    }
    window.addEventListener('nugget-player-connected', update);
    player.restore().then(update);
    return {
      from(table) {
        if (!['products','places','place_products'].includes(table)) throw Error('scoped_table_unavailable');
        return publicClient.from(table);
      },
      auth: {
        async getSession() {
          const person = player.current();
          return {data:{session:person ? {user:{id:person.participant}} : null}};
        },
        signOut: player.logout
      },
      rpc(name, parameters = {}) {
        const person = player.current();
        const promise = (async () => {
          try {
            if (name === 'take_cards') return {data:await player.request('feed', parameters, person?.token),error:null};
            if (name === 'take_responses') return {data:await player.request('responses', {id:parameters.p_take}, person?.token),error:null};
            if (name === 'list_trails' && person) return {data:await player.api('screen',{operation:'trail_list',data:parameters},true,person.participant),error:null};
            if (publicReads.has(name)) return await publicClient.rpc(name,parameters);
            if (!person) throw Error('participant_session_required');
            const aliases = {submit_take_request:'submit_context_take',submit_price_request:'submit_price'};
            const operation = aliases[name] || name;
            if (actions.has(operation)) return {data:await action(player,person,operation,parameters),error:null};
            if (screens.has(name)) return {data:await player.api('screen',{operation:name,data:parameters},true,person.participant),error:null};
            if (name === 'export_my_data') return {data:await player.api('screen',{operation:'export',data:{}},true,person.participant),error:null};
            if (['export_wave2_take_data','export_discovery_data','export_matchup_data','export_participation_data'].includes(name)) return {data:{},error:null};
            throw Error('scoped_action_unavailable');
          } catch (error) { return {data:null,error:{message:error.message}}; }
        })();
        promise.single = async () => {
          const result = await promise;
          return {...result,data:Array.isArray(result.data)?result.data[0]||null:result.data};
        };
        return promise;
      }
    };
  };
})();
