const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
};

// FIX: Use relative URL derived at runtime instead of hardcoded project ref
const SDK_JS = `
/**
 * OPollmarket JavaScript SDK v1.1.0
 * https://opoll.org
 */
(function(global) {
  'use strict';

  var DEFAULT_BASE = 'https://opoll.org/api';

  function OPollmarket(options) {
    if (!options || !options.apiKey) throw new Error('OPollmarket: apiKey is required');
    this.apiKey = options.apiKey;
    this.userToken = null;
    this.baseUrl = options.baseUrl || DEFAULT_BASE;
  }

  OPollmarket.prototype._request = function(action, params, method, body) {
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
  OPollmarket.prototype.setUserToken = function(token) {
    this.userToken = token;
  };

  // List markets
  OPollmarket.prototype.getMarkets = function(params) {
    return this._request('markets', params);
  };

  // Get single market
  OPollmarket.prototype.getMarket = function(id) {
    return this._request('market', { id: id });
  };

  // Get authenticated user's balance (no longer accepts userId param)
  OPollmarket.prototype.getBalance = function() {
    return this._request('balance');
  };

  // Get authenticated user's positions (no longer accepts userId param)
  OPollmarket.prototype.getPositions = function() {
    return this._request('positions');
  };

  // Place a bet (requires user token)
  OPollmarket.prototype.placeBet = function(data) {
    return this._request('place-bet', null, 'POST', data);
  };

  // Create a user account
  OPollmarket.prototype.createUser = function(data) {
    return this._request('create-user', null, 'POST', data);
  };

  // Initiate deposit (requires user token)
  OPollmarket.prototype.deposit = function(data) {
    return this._request('deposit', null, 'POST', data);
  };

  // Create a market (requires user token)
  OPollmarket.prototype.createMarket = function(data) {
    return this._request('create-market', null, 'POST', data);
  };

  // Embed helper - renders a market widget in a target element
  OPollmarket.prototype.embedMarket = function(marketId, targetElement) {
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
    module.exports = OPollmarket;
  } else {
    global.OPollmarket = OPollmarket;
  }
})(typeof window !== 'undefined' ? window : this);
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(SDK_JS, { headers: corsHeaders });
});
