/* ===========================================================
   Forecast — Shared application logic
   Wallet connection, dark mode, interactions, modals, stake.
   =========================================================== */

(function () {
  'use strict';

  // ---- Dark mode -------------------------------------------------
  function getTheme() { return localStorage.getItem('forecast-theme') || 'light'; }
  function setTheme(t) {
    localStorage.setItem('forecast-theme', t);
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : '');
  }
  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  // Init theme
  var saved = getTheme();
  setTheme(saved);

  // ---- Wallet state ----------------------------------------------
  var walletState = {
    status: 'disconnected', // disconnected | connecting | connected
    address: '0xA1b2C3d4E5f6G7h8I9j0',
    balance: '1,247.32'
  };

  function updateWalletUI() {
    var btns = document.querySelectorAll('.wallet-btn');
    btns.forEach(function (btn) {
      if (walletState.status === 'disconnected') {
        btn.className = 'wallet-btn';
        btn.innerHTML = '<span class="wallet-dot"></span> Connect Wallet';
      } else if (walletState.status === 'connecting') {
        btn.className = 'wallet-btn connecting';
        btn.innerHTML = '<span class="wallet-dot"></span> Connecting…';
      } else if (walletState.status === 'connected') {
        btn.className = 'wallet-btn connected';
        btn.innerHTML =
          '<span class="wallet-dot"></span>' +
          walletState.address.slice(0, 6) + '…' + walletState.address.slice(-4) +
          ' <span style="color:var(--muted);font-size:11px;font-weight:400;">$' + walletState.balance + ' USDC</span>';
      }
    });
  }

  function connectWallet() {
    if (walletState.status === 'connected') return;
    walletState.status = 'connecting';
    updateWalletUI();
    setTimeout(function () {
      walletState.status = 'connected';
      updateWalletUI();
    }, 1500);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.wallet-btn');
    if (btn && walletState.status !== 'connected') {
      connectWallet();
    }
  });

  // Re-run on page load (wallet-btn might not exist yet if loaded dynamically,
  // but the JS runs after DOM ready so it's fine).
  document.addEventListener('DOMContentLoaded', updateWalletUI);
  // Also run immediately if DOM already loaded
  if (document.readyState !== 'loading') updateWalletUI();

  // ---- Filter chips (Home) --------------------------------------
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.filter-chip');
    if (!chip) return;
    var parent = chip.closest('.filter-bar-inner');
    if (!parent) return;
    parent.querySelectorAll('.filter-chip').forEach(function (c) {
      c.classList.remove('active');
    });
    chip.classList.add('active');
  });

  // ---- Tabs (Portfolio) -----------------------------------------
  document.addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    var parent = tab.closest('.tabs');
    if (!parent) return;
    parent.querySelectorAll('.tab').forEach(function (t) {
      t.classList.remove('active');
    });
    tab.classList.add('active');

    // Toggle tab content
    var container = tab.closest('[data-tabs]');
    if (container) {
      var tabId = tab.getAttribute('data-tab');
      container.querySelectorAll('[data-tab-content]').forEach(function (c) {
        c.style.display = c.getAttribute('data-tab-content') === tabId ? '' : 'none';
      });
    }
  });

  // ---- Option selection (Pool Detail) ----------------------------
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.option-card');
    if (!card) return;
    var parent = card.closest('.option-cards');
    if (!parent) return;
    parent.querySelectorAll('.option-card').forEach(function (c) {
      c.classList.remove('selected');
    });
    card.classList.add('selected');

    // Trigger stake panel update
    var name = card.querySelector('.option-card-name');
    var pct = card.querySelector('.option-card-pct');
    var odds = card.querySelector('.option-card-odds');
    var panel = card.closest('.pool-detail-layout') || document;
    var label = panel.querySelector('.stake-option-label strong');
    if (label && name) label.textContent = '"' + name.textContent + '"';

    // Reset stake input
    var input = panel.querySelector('.stake-input');
    if (input) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
  });

  // ---- Stake input live feedback ---------------------------------
  document.addEventListener('input', function (e) {
    if (!e.target.classList.contains('stake-input')) return;
    var val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
    var panel = e.target.closest('.stake-panel');
    if (!panel) return;

    var shareEl = panel.querySelector('.stake-share');
    var oddsEl = panel.querySelector('.stake-odds');
    var btn = panel.querySelector('.btn-primary');

    // Simulate pool math: pool = 10000, split = 60/40, win share
    if (shareEl && oddsEl) {
      var poolTotal = 12480;
      var poolShare = 0.6; // this option has 60%
      var winnings = val * (1 / poolShare) * 0.99; // minus 1% fee
      var odds = (1 / poolShare).toFixed(1);
      shareEl.textContent = formatCurrency(winnings);
      oddsEl.textContent = odds + 'x';
    }

    // Enable/disable stake button
    if (btn) {
      if (val > 0) {
        btn.removeAttribute('disabled');
      } else {
        btn.setAttribute('disabled', '');
      }
    }
  });

  // ---- Stake button action ---------------------------------------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.stake-btn');
    if (!btn) return;
    if (btn.hasAttribute('disabled')) return;
    if (btn.dataset.confirmed) return;

    var panel = btn.closest('.stake-panel');
    if (!panel) return;
    var input = panel.querySelector('.stake-input');
    var val = input ? input.value : '0';
    var label = panel.querySelector('.stake-option-label strong');
    var opt = label ? label.textContent : 'this option';

    btn.classList.add('loading');
    btn.setAttribute('disabled', '');

    setTimeout(function () {
      btn.className = 'btn btn-primary btn-full stake-btn';
      btn.dataset.confirmed = 'true';
      btn.textContent = 'You staked $' + val + ' USDC on ' + opt;
      btn.removeAttribute('disabled');
    }, 1500);
  });

  // ---- Modal controls --------------------------------------------
  document.addEventListener('click', function (e) {
    var overlay = e.target.closest('.modal-overlay');
    if (overlay && e.target === overlay) {
      overlay.classList.remove('open');
    }
    var close = e.target.closest('.modal-close');
    if (close) {
      close.closest('.modal-overlay').classList.remove('open');
    }
  });

  // ---- Bottom sheet controls (mobile) ----------------------------
  document.addEventListener('click', function (e) {
    var overlay = e.target.closest('.bottom-sheet-overlay');
    if (overlay && e.target === overlay) {
      overlay.classList.remove('open');
    }
  });

  // ---- Filter empty state (Home - category filter) ---------------
  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.filter-chip');
    if (!chip) return;
    var container = document.querySelector('[data-pool-feed]');
    if (!container) return;
    var sections = container.querySelectorAll('.category-section');
    var value = chip.textContent.trim().toLowerCase();

    sections.forEach(function (sec) {
      if (value === 'all' || value === 'trending' || value === 'closing soon' || value === 'newly created') {
        sec.style.display = '';
      } else {
        // Filter by category - show only matching pools
        sec.style.display = '';
        var cards = sec.querySelectorAll('.pool-card');
        cards.forEach(function (card) {
          var cat = (card.dataset.category || '').toLowerCase();
          if (cat === value) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
        // Hide section if no visible cards
        var visible = Array.from(sec.querySelectorAll('.pool-card')).filter(function (c) {
          return c.style.display !== 'none';
        });
        if (visible.length === 0) sec.style.display = 'none';
      }
    });
  });

  // ---- AI analysis unlock button ---------------------------------
  document.addEventListener('click', function (e) {
    var unlock = e.target.closest('.btn-unlock-ai');
    if (!unlock) return;
    var container = unlock.closest('[data-ai-locked]');
    if (!container) return;

    var blur = container.querySelector('.blur-preview');
    var overlay = container.querySelector('.blur-overlay');
    if (blur) blur.classList.remove('blur-preview');
    if (overlay) overlay.style.display = 'none';
  });

  // ---- X402 payment simulation (modal unlock) --------------------
  document.addEventListener('click', function (e) {
    var pay = e.target.closest('.btn-pay-ai');
    if (!pay) return;
    var container = pay.closest('[data-ai-unlock]');
    if (!container) return;

    pay.classList.add('loading');
    pay.setAttribute('disabled', '');

    setTimeout(function () {
      var blur = container.querySelector('.blur-preview');
      var overlay = container.querySelector('.blur-overlay');
      if (blur) blur.classList.remove('blur-preview');
      if (overlay) overlay.style.display = 'none';
      pay.textContent = 'Unlocked';
      pay.className = 'btn btn-ghost btn-full';
      pay.removeAttribute('disabled');
    }, 1200);
  });

  // ---- Create pool - dynamic options -----------------------------
  document.addEventListener('click', function (e) {
    var add = e.target.closest('.btn-add-option');
    if (!add) return;
    var container = add.closest('[data-dynamic-options]');
    if (!container) return;
    var list = container.querySelector('.option-list');
    var count = list ? list.querySelectorAll('.option-row').length : 0;
    if (count >= 10) return;

    var row = document.createElement('div');
    row.className = 'option-row';
    row.innerHTML =
      '<input class="form-input" type="text" placeholder="Option ' + (count + 1) + '" />' +
      '<button class="option-remove" type="button" aria-label="Remove option">✕</button>';
    if (list) list.appendChild(row);
  });

  document.addEventListener('click', function (e) {
    var remove = e.target.closest('.option-remove');
    if (!remove) return;
    var container = remove.closest('[data-dynamic-options]');
    if (!container) return;
    var list = container.querySelector('.option-list');
    var rows = list ? list.querySelectorAll('.option-row') : [];
    if (rows.length <= 2) return;
    remove.closest('.option-row').remove();
  });

  // ---- Create pool - preview step --------------------------------
  document.addEventListener('click', function (e) {
    var preview = e.target.closest('.btn-preview-pool');
    if (!preview) return;
    var form = preview.closest('[data-create-form]');
    if (!form) return;

    var formView = form.querySelector('[data-form-view]');
    var previewView = form.querySelector('[data-preview-view]');
    if (formView) formView.style.display = 'none';
    if (previewView) previewView.style.display = '';
  });

  document.addEventListener('click', function (e) {
    var back = e.target.closest('.btn-back-edit');
    if (!back) return;
    var form = back.closest('[data-create-form]');
    if (!form) return;

    var formView = form.querySelector('[data-form-view]');
    var previewView = form.querySelector('[data-preview-view]');
    if (formView) formView.style.display = '';
    if (previewView) previewView.style.display = 'none';
  });

  // ---- Date/time picker preset buttons ---------------------------
  document.addEventListener('click', function (e) {
    var preset = e.target.closest('[data-date-preset]');
    if (!preset) return;
    var input = preset.closest('.form-group').querySelector('.form-input');
    if (!input) return;

    var now = new Date();
    var days = parseInt(preset.dataset.datePreset, 10);
    now.setDate(now.getDate() + days);
    input.value = now.toISOString().slice(0, 16);
  });

  // ---- Helpers ---------------------------------------------------
  function formatCurrency(n) {
    if (!n || isNaN(n)) return '$0.00';
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  window.ForecastApp = {
    toggleTheme: toggleTheme,
    getTheme: getTheme,
    connectWallet: connectWallet,
    walletState: walletState,
    formatCurrency: formatCurrency
  };
})();
