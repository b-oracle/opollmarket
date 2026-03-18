const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

const SDK_JS = `
/**
 * OPOLL JavaScript SDK v1.0.0
 * https://opoll.org
 */
(function(global) {
  'use strict';

  var API_BASE = 'https://dqtjuhqndncanfwgjwva.supabase.co/functions/v1/api-public';

  function OPOLL(options) {
    if (!options || !options.apiKey) throw new Error('OPOLL: apiKey is required');
    this.apiKey = options.apiKey;
    this.userToken = null;
    this.baseUrl = options.baseUrl || API_BASE;
  }

  OPOLL.prototype._request = function(action, params, method, body) {
    method = method || 'GET';
    var url = this.baseUrl + '?action=' + encodeURIComponent(action);
    if (params) {
      Object.keys(params).forEach(function(k) {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      });
    }
    var headers = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
    if (this.userToken) {
      headers['Authorization'] = 'Bearer ' + this.userToken;
    }
    var opts = { method: method, headers: headers };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function(res) {
      return res.json().then(function(data) {
        if (data.error) throw new Error(data.error);
        return data;
      });
    });
  };

  // Set user auth token (obtained from your own auth flow)
  OPOLL.prototype.setUserToken = function(token) {
    this.userToken = token;
  };

  // List markets
  OPOLL.prototype.getMarkets = function(params) {
    return this._request('markets', params);
  };

  // Get single market
  OPOLL.prototype.getMarket = function(id) {
    return this._request('market', { id: id });
  };

  // Get user balance
  OPOLL.prototype.getBalance = function(userId) {
    return this._request('balance', { user_id: userId });
  };

  // Get user positions
  OPOLL.prototype.getPositions = function(userId) {
    return this._request('positions', { user_id: userId });
  };

  // Place a bet (requires user token)
  OPOLL.prototype.placeBet = function(data) {
    return this._request('place-bet', null, 'POST', data);
  };

  // Create a user account
  OPOLL.prototype.createUser = function(data) {
    return this._request('create-user', null, 'POST', data);
  };

  // Initiate deposit (requires user token)
  OPOLL.prototype.deposit = function(data) {
    return this._request('deposit', null, 'POST', data);
  };

  // Embed helper - renders a market widget in a target element
  OPOLL.prototype.embedMarket = function(marketId, targetElement) {
    var iframe = document.createElement('iframe');
    iframe.src = 'https://opoll.org/embed/market/' + marketId;
    iframe.style.width = '100%';
    iframe.style.height = '320px';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '12px';
    iframe.setAttribute('loading', 'lazy');
    if (typeof targetElement === 'string') {
      targetElement = document.querySelector(targetElement);
    }
    if (targetElement) {
      targetElement.innerHTML = '';
      targetElement.appendChild(iframe);
    }
    return iframe;
  };

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OPOLL;
  } else {
    global.OPOLL = OPOLL;
  }
})(typeof window !== 'undefined' ? window : this);
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(SDK_JS, { headers: corsHeaders });
});
