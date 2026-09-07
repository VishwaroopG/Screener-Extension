document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabSearch = document.getElementById('tab-search');
  const tabWatchlist = null;
  const tabNews = document.getElementById('tab-news');
  const viewSearch = document.getElementById('view-search');
  const viewNews = document.getElementById('view-news');
  const btnSearch = document.getElementById('btn-search');
  const inputSearch = document.getElementById('input-search');
  const resultsSearch = document.getElementById('results-search');
  const searchSuggestions = document.getElementById('search-suggestions');

  const btnWlAdd = null;
  const inputWlAdd = null;
  const wlItemsContainer = document.getElementById('wl-items-container');
  const wlSuggestions = null;

  const themeToggle = document.getElementById('theme-toggle');
  
  const portfolioSelect = document.getElementById('portfolio-select');
  const btnNewPortfolio = document.getElementById('btn-new-portfolio');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const newsContainer = document.getElementById('news-container');

  let activePortfolio = 'Sample';
  // Tab Switching Logic
  function switchTab(activeTab, activeView) {
    [tabSearch, tabNews].forEach(t => t && t.classList.remove('active'));
    [viewSearch, viewNews].forEach(v => v && v.classList.remove('active'));
    
    activeTab.classList.add('active');
    activeView.classList.add('active');
    
    if (activeTab === tabSearch) renderWatchlist();
    if (activeTab === tabNews) renderNews();
  }

  tabSearch.addEventListener('click', () => switchTab(tabSearch, viewSearch));
  tabNews.addEventListener('click', () => switchTab(tabNews, viewNews));
  // --- Google Material Design 3 Header Controls ---
  const svgMoon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/></svg>`;
  const svgSun = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3m0-2c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>`;
  const svgPause = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  const svgPlay = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const svgEye = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
  const svgEyeOff = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`;

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      if (themeToggle) {
        themeToggle.innerHTML = svgSun;
        themeToggle.title = 'Switch to Light Mode';
      }
    } else {
      document.body.classList.remove('dark-mode');
      if (themeToggle) {
        themeToggle.innerHTML = svgMoon;
        themeToggle.title = 'Switch to Dark Mode';
      }
    }
  }

  // Load Initial Theme
  chrome.storage.local.get(['theme'], (res) => {
    applyTheme(res.theme || 'light');
  });

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isDark = document.body.classList.contains('dark-mode');
      const nextTheme = isDark ? 'light' : 'dark';
      applyTheme(nextTheme);
      chrome.storage.local.set({ theme: nextTheme });
    });
  }

  // Tape Speed Control Popover (0.5x to 3.0x with 0.1 intervals)
  const tapeSpeedBtn = document.getElementById('tape-speed-btn');
  const speedPopover = document.getElementById('speed-popover');
  const speedSlider = document.getElementById('speed-slider');
  const speedDisplayVal = document.getElementById('speed-display-val');
  const btnSpeedMinus = document.getElementById('btn-speed-minus');
  const btnSpeedPlus = document.getElementById('btn-speed-plus');
  const speedCustomInput = document.getElementById('speed-custom-input');

  function setSpeedMultiplier(mult, save = true) {
    let m = parseFloat(mult);
    if (isNaN(m)) m = 1.0;
    m = Math.round(m * 10) / 10;
    if (m < 0.5) m = 0.5;
    if (m > 3.0) m = 3.0;

    const formatted = m.toFixed(1) + 'x';
    if (tapeSpeedBtn) {
      tapeSpeedBtn.textContent = formatted;
      tapeSpeedBtn.title = `Tape Speed: ${formatted} (Click to adjust 0.5x – 3.0x)`;
    }
    if (speedDisplayVal) speedDisplayVal.textContent = formatted;
    if (speedSlider) speedSlider.value = m.toString();
    if (speedCustomInput && document.activeElement !== speedCustomInput) speedCustomInput.value = m.toFixed(1);

    if (save) {
      chrome.storage.local.set({ tapeSpeedMultiplier: m, tapeSpeed: m * 0.8 });
      try {
        chrome.runtime.sendMessage({ type: 'SET_TAPE_SPEED', speedMultiplier: m }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (e) {}
      try {
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({}, (tabs) => {
            for (const t of (tabs || [])) {
              if (t && t.id) {
                chrome.tabs.sendMessage(t.id, { type: 'TAPE_SPEED_UPDATE', speedMultiplier: m }, () => {
                  if (chrome.runtime.lastError) {}
                });
              }
            }
          });
        }
      } catch (e) {}
    }
  }

  // Toggle speed popover
  if (tapeSpeedBtn && speedPopover) {
    tapeSpeedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = speedPopover.style.display !== 'none';
      speedPopover.style.display = isOpen ? 'none' : 'block';
      if (!isOpen && speedCustomInput) {
        speedCustomInput.value = parseFloat(speedSlider ? speedSlider.value : 1.0).toFixed(1);
      }
    });

    document.addEventListener('click', (e) => {
      if (speedPopover && !speedPopover.contains(e.target) && e.target !== tapeSpeedBtn) {
        speedPopover.style.display = 'none';
      }
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      setSpeedMultiplier(e.target.value);
    });
  }

  if (btnSpeedMinus) {
    btnSpeedMinus.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = parseFloat(speedSlider ? speedSlider.value : 1.0);
      setSpeedMultiplier(cur - 0.1);
    });
  }

  if (btnSpeedPlus) {
    btnSpeedPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = parseFloat(speedSlider ? speedSlider.value : 1.0);
      setSpeedMultiplier(cur + 0.1);
    });
  }

  // Custom number input field in popover
  if (speedCustomInput) {
    speedCustomInput.addEventListener('input', () => {
      const val = parseFloat(speedCustomInput.value);
      if (!isNaN(val) && val >= 0.5 && val <= 3.0) {
        setSpeedMultiplier(val, true);
      }
    });
    speedCustomInput.addEventListener('blur', () => {
      const val = parseFloat(speedCustomInput.value);
      if (!isNaN(val)) {
        setSpeedMultiplier(val, true);
      }
    });
    speedCustomInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const val = parseFloat(speedCustomInput.value);
        if (!isNaN(val)) setSpeedMultiplier(val, true);
        speedPopover.style.display = 'none';
      }
    });
    speedCustomInput.addEventListener('click', (e) => e.stopPropagation());
  }

  // Clickable preset labels (0.5x, 1.0x, 2.0x, 3.0x)
  const speedPresets = document.querySelectorAll('.speed-preset');
  speedPresets.forEach(preset => {
    preset.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = parseFloat(preset.getAttribute('data-speed'));
      if (!isNaN(val)) {
        setSpeedMultiplier(val);
      }
    });
  });

  // Load Initial Speed
  chrome.storage.local.get(['tapeSpeedMultiplier', 'tapeSpeed'], (res) => {
    let initialM = 1.0;
    if (res.tapeSpeedMultiplier !== undefined) {
      initialM = parseFloat(res.tapeSpeedMultiplier);
    } else if (res.tapeSpeed !== undefined) {
      initialM = parseFloat(res.tapeSpeed) / 0.8;
    }
    setSpeedMultiplier(initialM, false);
  });

  const tapePauseBtn = document.getElementById('tape-pause-btn');
  const tapeVisibilityBtn = document.getElementById('tape-visibility-btn');
  let isTapePaused = false;
  let isTapeVisible = true;

  function updatePauseUI(paused) {
    isTapePaused = paused === true;
    if (!tapePauseBtn) return;
    tapePauseBtn.innerHTML = isTapePaused ? svgPlay : svgPause;
    tapePauseBtn.title = isTapePaused ? 'Resume Ticker Tape' : 'Pause Ticker Tape';
    tapePauseBtn.setAttribute('aria-label', isTapePaused ? 'Resume Ticker Tape' : 'Pause Ticker Tape');
    if (isTapePaused) {
      tapePauseBtn.classList.add('tape-is-paused');
    } else {
      tapePauseBtn.classList.remove('tape-is-paused');
    }
  }

  function updateVisibilityUI(visible) {
    isTapeVisible = visible !== false; // default true
    if (!tapeVisibilityBtn) return;
    tapeVisibilityBtn.innerHTML = isTapeVisible ? svgEye : svgEyeOff;
    tapeVisibilityBtn.title = isTapeVisible ? 'Hide Ticker Tape' : 'Show Ticker Tape';
    tapeVisibilityBtn.setAttribute('aria-label', isTapeVisible ? 'Hide Ticker Tape' : 'Show Ticker Tape');
  }

  // Load Initial States from Storage
  chrome.storage.local.get(['tapePaused', 'tapeVisible'], (res) => {
    updatePauseUI(res.tapePaused === true);
    updateVisibilityUI(res.tapeVisible !== false);
  });

  // Listen for storage changes from any other window/panel
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.tapePaused !== undefined) {
        updatePauseUI(changes.tapePaused.newValue === true);
      }
      if (changes.tapeVisible !== undefined) {
        updateVisibilityUI(changes.tapeVisible.newValue !== false);
      }
    }
  });

  if (tapePauseBtn) {
    tapePauseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextState = !isTapePaused;

      // 1. Instant optimistic UI update (0ms latency)
      updatePauseUI(nextState);

      // 2. Persist state to storage
      chrome.storage.local.set({ tapePaused: nextState });

      // 3. Notify background service worker
      try {
        chrome.runtime.sendMessage({ type: 'SET_TAPE_PAUSED', isPaused: nextState }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (err) {}

      // 4. Directly broadcast to all open tabs for instant content script response
      try {
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({}, (tabs) => {
            for (const t of (tabs || [])) {
              if (t && t.id) {
                chrome.tabs.sendMessage(t.id, { type: 'TAPE_PAUSE_UPDATE', isPaused: nextState }, () => {
                  if (chrome.runtime.lastError) {}
                });
              }
            }
          });
        }
      } catch (err) {}
    });
  }

  if (tapeVisibilityBtn) {
    tapeVisibilityBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextState = !isTapeVisible;

      // 1. Instant optimistic UI update (0ms latency)
      updateVisibilityUI(nextState);

      // 2. Persist state to storage
      chrome.storage.local.set({ tapeVisible: nextState });

      // 3. Notify background service worker
      try {
        chrome.runtime.sendMessage({ type: 'SET_TAPE_VISIBLE', isVisible: nextState }, () => {
          if (chrome.runtime.lastError) {}
        });
      } catch (err) {}

      // 4. Directly broadcast to all open tabs for instant content script response
      try {
        if (chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({}, (tabs) => {
            for (const t of (tabs || [])) {
              if (t && t.id) {
                chrome.tabs.sendMessage(t.id, { type: 'TAPE_VISIBILITY_UPDATE', isVisible: nextState }, () => {
                  if (chrome.runtime.lastError) {}
                });
              }
            }
          });
        }
      } catch (err) {}
    });
  }

  // --- Domain Disable Logic ---
  const tapeDomainBtn = document.getElementById('tape-domain-btn');
  let currentDomain = '';
  let disabledDomains = [];

  const svgDomainDisabled = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#d93025"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>';
  const svgDomainEnabled = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>';

  function updateDomainUI() {
    if (!tapeDomainBtn || !currentDomain) return;
    const isDisabled = disabledDomains.includes(currentDomain);
    tapeDomainBtn.innerHTML = isDisabled ? svgDomainDisabled : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>';
    tapeDomainBtn.title = isDisabled ? `Enable on ${currentDomain}` : `Disable on ${currentDomain}`;
    
    if (isDisabled) {
      tapeDomainBtn.style.color = '#d93025';
    } else {
      tapeDomainBtn.style.color = ''; // reset to default
    }
  }

  // Get current active tab
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs && tabs.length > 0 && tabs[0].url) {
      try {
        currentDomain = new URL(tabs[0].url).hostname;
        chrome.storage.local.get(['disabledDomains'], (res) => {
          disabledDomains = res.disabledDomains || [];
          updateDomainUI();
        });
      } catch (e) {}
    }
  });

  if (tapeDomainBtn) {
    tapeDomainBtn.addEventListener('click', () => {
      if (!currentDomain) return;
      const isCurrentlyDisabled = disabledDomains.includes(currentDomain);
      if (isCurrentlyDisabled) {
        disabledDomains = disabledDomains.filter(d => d !== currentDomain);
      } else {
        disabledDomains.push(currentDomain);
      }
      
      chrome.storage.local.set({ disabledDomains }, () => {
        updateDomainUI();
        // Send message to active tab to show/hide instantly
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          if (tabs && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'TAPE_DOMAIN_TOGGLE', disabled: !isCurrentlyDisabled }, () => {
              if (chrome.runtime.lastError) {}
            });
          }
        });
      });
    });
  }

  // When tab changes, update domain UI
  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab && tab.url) {
        try {
          currentDomain = new URL(tab.url).hostname;
          updateDomainUI();
        } catch (e) {}
      }
    });
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && tab.url) {
      try {
        currentDomain = new URL(tab.url).hostname;
        updateDomainUI();
      } catch (e) {}
    }
  });



  // About & Support Modal
  const btnAbout = document.getElementById('btn-about');
  const aboutModal = document.getElementById('about-modal');
  const btnAboutClose = document.getElementById('btn-about-close');

  if (btnAbout && aboutModal) {
    btnAbout.addEventListener('click', () => {
      aboutModal.style.display = 'flex';
    });
  }
  if (btnAboutClose && aboutModal) {
    btnAboutClose.addEventListener('click', () => {
      aboutModal.style.display = 'none';
    });
  }
  if (aboutModal) {
    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) aboutModal.style.display = 'none';
    });
  }


  // --- Multi-Portfolio Logic ---
  const btnRenamePortfolio = document.getElementById('btn-rename-portfolio');
  
  function loadPortfolios(callback) {
    chrome.storage.local.get(['portfolios', 'screenerWatchlist'], (res) => {
      let portfolios = res.portfolios || {};
      let needsSave = false;
      
      // Migration for old users & Default override
      if (portfolios['Default'] && !portfolios['Sample']) {
        let listToMigrate = portfolios['Default'];
        if (listToMigrate.length === 0) {
           listToMigrate = ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
        }
        portfolios['Sample'] = listToMigrate;
        delete portfolios['Default'];
        if (activePortfolio === 'Default') activePortfolio = 'Sample';
        needsSave = true;
      }

      if (Object.keys(portfolios).length === 0) {
        // Pre-populate with top US stocks if empty
        let initialList = res.screenerWatchlist && res.screenerWatchlist.length > 0 ? res.screenerWatchlist : ['AAPL', 'MSFT', 'NVDA', 'TSLA'];
        portfolios['Sample'] = initialList;
        if (activePortfolio === 'Default') activePortfolio = 'Sample';
        needsSave = true;
      }

      portfolioSelect.innerHTML = '';
      for (const name in portfolios) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        portfolioSelect.appendChild(opt);
      }
      portfolioSelect.value = activePortfolio;

      if (needsSave) {
        chrome.storage.local.set({ portfolios, screenerWatchlist: portfolios['Sample'] }, () => {
          if (callback) callback();
        });
      } else {
        if (callback) callback();
      }
    });
  }

  loadPortfolios(() => {
    renderDefaultSearch();
    renderWatchlist(); // Instantly render watchlist from cache with zero delay!
  });

  portfolioSelect.addEventListener('change', (e) => {
    activePortfolio = e.target.value;
    chrome.storage.local.get(['portfolios'], (res) => {
       const ports = res.portfolios || {};
       chrome.storage.local.set({ screenerWatchlist: ports[activePortfolio] || [] }, () => {
         renderWatchlist();
       });
    });
  });

  // --- Custom Text Prompt Logic ---
  const textPromptModal = document.getElementById('text-prompt-modal');
  const textPromptTitle = document.getElementById('text-prompt-title');
  const textPromptInput = document.getElementById('text-prompt-input');
  const btnTextPromptCancel = document.getElementById('btn-text-prompt-cancel');
  const btnTextPromptSave = document.getElementById('btn-text-prompt-save');

  let textPromptCallback = null;

  function showCustomPrompt(title, defaultValue, callback) {
    textPromptTitle.textContent = title;
    textPromptInput.value = defaultValue || '';
    textPromptCallback = callback;
    textPromptModal.style.display = 'flex';
    setTimeout(() => {
      textPromptInput.focus();
      textPromptInput.select();
    }, 50);
  }

  function closeCustomPrompt() {
    textPromptModal.style.display = 'none';
    textPromptCallback = null;
  }

  btnTextPromptCancel.addEventListener('click', closeCustomPrompt);
  
  textPromptModal.addEventListener('click', (e) => {
    if (e.target === textPromptModal) closeCustomPrompt();
  });

  btnTextPromptSave.addEventListener('click', () => {
    if (textPromptCallback) {
      textPromptCallback(textPromptInput.value);
    }
    closeCustomPrompt();
  });
  
  textPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnTextPromptSave.click();
    } else if (e.key === 'Escape') {
      btnTextPromptCancel.click();
    }
  });

  if (btnRenamePortfolio) {
    btnRenamePortfolio.addEventListener('click', () => {
      showCustomPrompt(`Rename portfolio "${activePortfolio}"`, activePortfolio, (newName) => {
        if (newName && newName.trim() !== '' && newName !== activePortfolio) {
          chrome.storage.local.get(['portfolios'], (res) => {
            let ports = res.portfolios || {};
            if (ports[newName]) {
              alert("A portfolio with this name already exists!");
              return;
            }
            ports[newName] = ports[activePortfolio];
            delete ports[activePortfolio];
            activePortfolio = newName;
            chrome.storage.local.set({ portfolios: ports }, () => {
              loadPortfolios();
            });
          });
        }
      });
    });
  }

  btnNewPortfolio.addEventListener('click', () => {
    showCustomPrompt("New portfolio name", "", (name) => {
      if (name && name.trim() !== '') {
        chrome.storage.local.get(['portfolios'], (res) => {
          const ports = res.portfolios || {};
          if (!ports[name]) {
            ports[name] = [];
            activePortfolio = name;
            chrome.storage.local.set({ portfolios: ports, screenerWatchlist: [] }, () => {
              loadPortfolios();
              renderWatchlist();
            });
          } else {
            alert("A portfolio with this name already exists!");
          }
        });
      }
    });
  });


  // --- Export to CSV ---
  btnExportCsv.addEventListener('click', () => {
    
    chrome.storage.local.get(['portfolios', 'cachedData'], (res) => {
      const list = (res.portfolios || {})[activePortfolio] || [];
      const data = res.cachedData || {};
      
      let csv = "Ticker,Company,Current Price,P/E,Market Cap,ROCE\n";
      for (const ticker of list) {
        const d = data[ticker];
        if (d && d.success) {
          csv += `"${ticker}","${d.companyName}","${d.ratios['Current Price']||''}","${d.ratios['Stock P/E']||''}","${d.ratios['Market Cap']||''}","${d.ratios['ROCE']||''}"\n`;
        }
      }
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Screener_Watchlist_${activePortfolio}.csv`;
      a.click();
    });
  });

  // --- Smart Verdict Engine ---
  function generateVerdict(ratios) {
    const peRaw = ratios['Stock P/E'];
    const roceRaw = ratios['ROCE'];
    

    if (!peRaw || !roceRaw) return `<div style="background:var(--verdict-bg); border:1px solid var(--verdict-border); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;"><span style="color:var(--label-color); font-weight:600;">AI Verdict:</span> <span style="color:#fbbc04; font-weight:500;">Not enough data to formulate a verdict.</span></div>`;
    
    const pe = parseFloat(peRaw.replace(/[^\d\.\-]/g, ''));
    const roce = parseFloat(roceRaw.replace(/[^\d\.\-]/g, ''));
    
    let verdict = "";
    let sentimentColor = 'var(--label-color)';
    
    if (pe < 15 && roce > 20) {
      verdict = "[Undervalued] Gem with highly efficient capital return.";
      sentimentColor = 'var(--link-green)';
    } else if (pe > 40 && roce > 15) {
      verdict = "[Expensive] Strong business, but trading at an expensive premium.";
      sentimentColor = '#d93025';
    } else if (pe > 30 && roce < 10) {
      verdict = "[High Risk] Overvalued with poor capital efficiency.";
      sentimentColor = '#d93025';
    } else if (pe < 25 && roce > 15) {
      verdict = "[Solid] Great fundamentals at a reasonable price.";
      sentimentColor = 'var(--link-green)';
    } else {
      verdict = "[Average] Standard fundamentals. Monitor for growth catalysts.";
      sentimentColor = '#fbbc04';
    }

    return `<div style="background:var(--verdict-bg); border:var(--border-color); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;">
      <span style="color:var(--label-color); font-weight:600;">AI Verdict:</span> <span style="color:${sentimentColor}; font-weight:500;">${verdict}</span>
    </div>`;
  }

  // --- Search Logic ---
  btnSearch.addEventListener('click', async () => {
    const ticker = inputSearch.value.trim().toUpperCase();
    if (!ticker) return;
    
    resultsSearch.innerHTML = '<div class="screener-loading">Scraping data...</div>';
    
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'FORCE_SYNC', ticker: ticker }, resolve);
      });
      // The background script just synced, now we read from cache
      chrome.storage.local.get(['cachedData'], (res) => {
        const data = (res.cachedData || {})[ticker];
        if (data && data.success) {
           

           const companyUrl = (data.source === 'yahoo' || ticker.startsWith('^'))
             ? `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`
             : `https://www.screener.in/company/${ticker}/`;
           let html = `<div style="display:flex; justify-content:space-between; align-items:flex-start;">
             <h3 style="margin:0 0 4px 0;"><a href="${companyUrl}" target="_blank" style="color:var(--link-green); text-decoration:none;">${data.companyName}</a></h3>
             <button id="btn-back-dashboard" class="screener-btn screener-btn-secondary" style="padding:4px 8px; font-size:11px; flex-shrink:0; margin-left:8px;">← Back</button>
           </div>`;
           if (data.isIndex) {
             html += `<div style="background:var(--verdict-bg); border:var(--border-color); padding:12px; border-radius:8px; margin-top:12px; font-size:13px;"><span style="color:var(--label-color); font-weight:600;">AI Verdict:</span> <span style="color:var(--link-green); font-weight:500;">[Market Index] Key benchmark tracking market performance.</span></div>`;
           } else {
             html += generateVerdict(data.ratios);
           }

           // Add to Watchlist button
           html += `<button id="btn-search-add-wl" data-ticker="${ticker}" style="margin-top:12px; width:100%; padding:10px; border-radius:8px; border:1px solid var(--border-color); cursor:pointer; font-weight:600; font-size:14px; background:var(--btn-wl-bg); color:#fff;">+ Add to Watchlist</button>`;

           html += `<div style="width:100%; overflow-x:auto; margin-top:16px; border:1px solid var(--border-color); border-radius:8px;">`;
           html += `<table style="width:100%; border-collapse:collapse; overflow:hidden; font-size:14px; font-family:Roboto,sans-serif;">`;
           let i = 0;
           for (const [k, v] of Object.entries(data.ratios)) {
             html += `<tr style="background:var(--verdict-bg);">
               <td style="padding:12px 16px; color:var(--label-color); font-weight:500; border-bottom:1px solid var(--border-light); white-space:nowrap;">${k}</td>
               <td style="padding:12px 16px; color:var(--text-color); font-weight:600; text-align:right; border-bottom:1px solid var(--border-light);">${v}</td>
             </tr>`;
             i++;
           }
           html += `</table></div>`;
           html += `<div style="text-align:right; margin-top:8px;">
             <a href="https://www.screener.in/company/${ticker}/" target="_blank" style="color:#1a73e8; font-size:12px; text-decoration:none; font-weight:500;">&#9881; Customize Parameters on Screener.in</a>
           </div>`;
           if (data.aboutText) html += `<div class="screener-about" style="margin-top:16px;">${data.aboutText}</div>`;
             
             html += `<div id="search-peers-container"></div>`;
             html += `<div id="search-announcements-container"></div>`;

             resultsSearch.innerHTML = html;

             // Async fetch for Peers & Announcements
             fetch(`https://www.screener.in/company/${ticker}/consolidated/`)
               .then(r => {
                 if (!r.ok) return fetch(`https://www.screener.in/company/${ticker}/`);
                 return r;
               })
               .then(r => r.text())
               .then(htmlStr => {
                 const parser = new DOMParser();
                 const doc = parser.parseFromString(htmlStr, 'text/html');
                 
                 // Parse Peers
                 const peersTable = doc.querySelector('#peers table');
                 if (peersTable) {
                   const trs = Array.from(peersTable.querySelectorAll('tr'));
                   trs.forEach(tr => {
                      Array.from(tr.querySelectorAll('a')).forEach(a => a.style.color = linkColor);
                      Array.from(tr.querySelectorAll('td')).forEach(td => td.style.padding = '8px');
                   });
                   const tableHtml = `<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:right; color:var(--text-color); white-space:nowrap;">${trs.slice(0,4).map(tr => {
                     const isHeader = tr.querySelector('th');
                     return `<tr style="border-bottom:1px solid var(--border-color); ${isHeader ? 'font-weight:bold; background:var(--row-even)' : ''}">${tr.innerHTML}</tr>`;
                   }).join('')}</table>`;
                   document.getElementById('search-peers-container').innerHTML = `<h4 style="margin:16px 0 8px 0; color:var(--text-color);">Peer Comparison</h4><div style="border:1px solid var(--border-color); border-radius:8px; overflow-x:auto;">${tableHtml}</div>`;
                 }
                 
                 // Parse Announcements (Documents)
                 const docsSec = doc.querySelector('#documents');
                 if (docsSec) {
                   // Announcements are usually the first <ul>
                   const annList = docsSec.querySelector('ul');
                   if (annList) {
                     const lis = Array.from(annList.querySelectorAll('li')).slice(0, 5);
                     const annHtml = lis.map(li => {
                       const link = li.querySelector('a');
                       if (link) {
                         link.style.color = linkColor;
                         link.style.textDecoration = 'none';
                         if (link.href.startsWith('chrome-extension')) {
                           link.href = 'https://www.screener.in' + link.getAttribute('href');
                         }
                       }
                       return `<div style="padding:8px 0; border-bottom:1px solid var(--border-color); font-size:12px; color:var(--text-color);">${li.innerHTML}</div>`;
                     }).join('');
                     document.getElementById('search-announcements-container').innerHTML = `<h4 style="margin:16px 0 8px 0; color:var(--text-color);">Company Announcements</h4>${annHtml}`;
                   }
                 }
               })
               .catch(() => {});
  
             // Wire up the Add to Watchlist button
           const addBtn = document.getElementById('btn-search-add-wl');
           if (addBtn) {
             addBtn.onclick = () => {
               chrome.storage.local.get(['portfolios'], (r) => {
                 const ports = r.portfolios || {};
                 const list = ports[activePortfolio] || [];
                 if (!list.includes(ticker)) {
                   list.push(ticker);
                   ports[activePortfolio] = list;
                   chrome.storage.local.set({ portfolios: ports, screenerWatchlist: list }, () => {
                     addBtn.textContent = 'Added!';
                     addBtn.style.background = '#5f6368';
                     addBtn.disabled = true;
                     chrome.runtime.sendMessage({ type: 'FORCE_SYNC' });
                   });
                 } else {
                   addBtn.textContent = 'Already in Watchlist';
                   addBtn.style.background = '#5f6368';
                 }
               });
             };
           }
        } else {
           resultsSearch.innerHTML = '<div class="screener-error">Could not fetch data.</div>';
        }
      });
    } catch (e) {
      resultsSearch.innerHTML = '<div class="screener-error">Error.</div>';
    }
  });
  
  // --- Event Delegation for Back Button ---
  resultsSearch.addEventListener('click', (e) => {
    if (e.target.closest('#btn-back-dashboard')) {
      inputSearch.value = '';
      searchSuggestions.style.display = 'none';
      renderDefaultSearch();
    }
  });

  // --- Watchlist Rendering ---
  function removeTicker(ticker) {
    chrome.storage.local.get(['portfolios'], (res) => {
      const ports = res.portfolios || {};
      const list = ports[activePortfolio] || [];
      ports[activePortfolio] = list.filter(t => t !== ticker);
      
      // Update screenerWatchlist compatibility
      chrome.storage.local.set({ portfolios: ports, screenerWatchlist: ports[activePortfolio] }, () => {
        renderWatchlist();
      });
    });
  }

    // btnWlAdd logic removed

  // --- Modals Logic ---
  const alertModal = document.getElementById('alert-modal');
  const btnAlertCancel = document.getElementById('btn-alert-cancel');
  const btnAlertSave = document.getElementById('btn-alert-save');
  const inputAlertAbove = document.getElementById('alert-above');
  const inputAlertBelow = document.getElementById('alert-below');
  let currentAlertTicker = '';

  window.openAlertModal = function(ticker) {
    currentAlertTicker = ticker;
    document.getElementById('alert-ticker').textContent = ticker;
    chrome.storage.local.get(['alerts'], (res) => {
      const alerts = res.alerts || {};
      inputAlertAbove.value = alerts[ticker]?.above || '';
      inputAlertBelow.value = alerts[ticker]?.below || '';
      alertModal.style.display = 'flex';
    });
  };

  btnAlertCancel.onclick = () => alertModal.style.display = 'none';
  btnAlertSave.onclick = () => {
    chrome.storage.local.get(['alerts'], (res) => {
      const alerts = res.alerts || {};
      const above = parseFloat(inputAlertAbove.value) || null;
      const below = parseFloat(inputAlertBelow.value) || null;
      if (above || below) {
        alerts[currentAlertTicker] = { above, below };
      } else {
        delete alerts[currentAlertTicker];
      }
      chrome.storage.local.set({ alerts }, () => {
        alertModal.style.display = 'none';
        renderWatchlist();
      });
    });
  };

  const noteModal = document.getElementById('note-modal');
  const btnNoteCancel = document.getElementById('btn-note-cancel');
  const btnNoteSave = document.getElementById('btn-note-save');
  const inputNoteText = document.getElementById('note-text');
  let currentNoteTicker = '';

  window.openNoteModal = function(ticker) {
    currentNoteTicker = ticker;
    document.getElementById('note-ticker').textContent = ticker;
    chrome.storage.local.get(['notes'], (res) => {
      const notes = res.notes || {};
      inputNoteText.value = notes[ticker] || '';
      noteModal.style.display = 'flex';
    });
  };

  btnNoteCancel.onclick = () => noteModal.style.display = 'none';
  btnNoteSave.onclick = () => {
    chrome.storage.local.get(['notes'], (res) => {
      const notes = res.notes || {};
      const txt = inputNoteText.value.trim();
      if (txt) {
        notes[currentNoteTicker] = txt;
      } else {
        delete notes[currentNoteTicker];
      }
      chrome.storage.local.set({ notes }, () => {
        noteModal.style.display = 'none';
        renderWatchlist();
      });
    });
  };

  function createSparkline(data) {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 50, height = 18;
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    const isUp = data[data.length - 1] >= data[0];
    const color = isUp ? '#188038' : '#d93025';
    return `<svg viewBox="-2 -2 ${width + 4} ${height + 4}" width="${width}" height="${height}" style="overflow:visible; display:block; margin: 4px auto;"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  let currentSortBy = null; // 'price', 'mcap'
  let currentSortDesc = true;
  let isDragging = false; // Prevent re-rendering while user is dragging

  function getSortIndicator(col) {
    if (currentSortBy !== col) return '';
    return currentSortDesc ? ' ▼' : ' ▲';
  }

  function handleSort(column) {
    if (currentSortBy === column) {
      currentSortDesc = !currentSortDesc;
    } else {
      currentSortBy = column;
      currentSortDesc = true;
    }
    renderWatchlist();
  }

  function renderWatchlist() {
    if (isDragging) return; // Do not interrupt drag and drop

    // Single consolidated fetch for instant rendering with zero network delay
    chrome.storage.local.get(['portfolios', 'screenerWatchlist', 'cachedData', 'notes', 'alerts'], (res) => {
      const ports = res.portfolios || {};
      let list = ports[activePortfolio] || res.screenerWatchlist || [];
      const cached = res.cachedData || {};
      const notesObj = res.notes || {};
      const alertsObj = res.alerts || {};

      if (list.length === 0) {
        wlItemsContainer.innerHTML = '<div style="text-align:center;color:var(--label-color);padding:24px 16px;font-size:13px;">Watchlist is empty. Search and add a ticker above!</div>';
        return;
      }

      // Handle Sorting
      if (currentSortBy) {
        list = [...list].sort((a, b) => {
          const dA = cached[a];
          const dB = cached[b];
          if (!dA || !dB) return 0;
          
          let valA = 0;
          let valB = 0;
          
          if (currentSortBy === 'price') {
            valA = parseFloat((dA.ratios['Current Price'] || '0').replace(/[^\d.-]/g, '')) || 0;
            valB = parseFloat((dB.ratios['Current Price'] || '0').replace(/[^\d.-]/g, '')) || 0;
          } else if (currentSortBy === 'mcap') {
            const parseMcap = (str) => {
              const num = parseFloat((str || '0').replace(/[^\d.-]/g, '')) || 0;
              if (str.includes('T')) return num * 1000;
              if (str.includes('B')) return num;
              if (str.includes('M')) return num / 1000;
              if (str.includes('Cr')) return num * 10; // Rs Crores ~ 10M
              return num;
            };
            valA = parseMcap(dA.ratios['Market Cap'] || '');
            valB = parseMcap(dB.ratios['Market Cap'] || '');
          }
          
          return currentSortDesc ? valB - valA : valA - valB;
        });
      }

      let html = `<div style="width:100%; overflow-x:auto; border:1px solid var(--border-color); border-radius:8px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:right; color:var(--text-color); white-space:nowrap;">
          <thead>
            <tr style="background:var(--header-bg); border-bottom:1px solid var(--border-color); font-weight:600;">
              <td style="text-align:left; padding:10px;">Symbol</td>
              <td style="padding:10px; text-align:center;">7D Trend</td>
              <td style="padding:10px; cursor:pointer;" id="sort-price" title="Sort by Price">Price${getSortIndicator('price')}</td>
              <td style="padding:10px;">P/E</td>
              <td style="padding:10px; cursor:pointer;" id="sort-mcap" title="Sort by Market Cap">M. Cap${getSortIndicator('mcap')}</td>
              <td style="padding:10px; text-align:center;">Actions</td>
            </tr>
          </thead>
          <tbody>`;
        
        let idx = 0;
        for (const ticker of list) {
          const data = cached[ticker];
          
          if (!data) {
             html += `<tr style="background:${idx % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)'}; border-bottom:1px solid var(--border-color);">
               <td colspan="6" style="padding:10px; text-align:left;">Waiting for sync (${ticker})...</td>
             </tr>`;
          } else {
            let pctHtml = '';
            let flashClass = '';
            if (data.changePct) {
              const color = data.changeDir === 'up' ? '#188038' : '#d93025';
              const sign = data.changeDir === 'up' ? '\u25B2' : '\u25BC';
              pctHtml = `<span style="color:${color}; font-size:11px;">${sign} ${data.changePct}</span>`;
            }
            flashClass = data.flash && (Date.now() - (data.flashTime || 0) < 5000) ? (data.flash === 'up' ? 'screener-flash-up' : 'screener-flash-down') : '';

            const noteTxt = notesObj[ticker] || '';
            const hasAlert = !!(alertsObj[ticker] && (alertsObj[ticker].above || alertsObj[ticker].below));
            
            const spark = createSparkline(data.sparkline);

            html += `
              <tr class="watchlist-row" draggable="true" data-ticker="${ticker}" style="background:${idx % 2 === 0 ? 'var(--row-even)' : 'var(--row-odd)'}; border-bottom:1px solid var(--border-color); cursor:grab;">
                <td style="text-align:left; padding:10px; font-weight:500;">
                  <span style="color:#aaa; margin-right:4px; font-size:10px;" title="Drag to reorder">⣿</span>
                  <a href="${data.source === 'yahoo' || ticker.startsWith('^') ? 'https://finance.yahoo.com/quote/' + encodeURIComponent(ticker) : 'https://www.screener.in/company/' + ticker + '/'}" target="_blank" title="${data.companyName}" style="color:var(--link-green); text-decoration:none;">${ticker}</a>
                  ${noteTxt ? `<div style="font-size:10px; color:#5f6368; font-weight:normal; max-width:100px; white-space:normal; margin-top:4px;">ðŸ“  ${noteTxt}</div>` : ''}
                </td>
                <td style="padding:10px;">${spark}</td>
                <td class="${flashClass}" style="padding:10px;">${data.ratios['Current Price']||'-'}<br/>${pctHtml}</td>
                <td style="padding:10px;">${data.ratios['Stock P/E']||'-'}</td>
                <td style="padding:10px;">${data.ratios['Market Cap']||'-'}</td>
                <td style="padding:10px; text-align:center;">
                  <button class="screener-note-btn" data-ticker="${ticker}" style="background:none; border:none; cursor:pointer; font-size:14px; padding:2px;" title="Add Note">\uD83D\uDCDD</button>
                  <button class="screener-alert-btn" data-ticker="${ticker}" style="background:none; border:none; cursor:pointer; font-size:14px; padding:2px;" title="Set Alert">${hasAlert ? '\uD83D\uDD14' : '\u23F0'}</button>
                  <button class="screener-del-btn" data-ticker="${ticker}" style="background:none; border:none; color:#d93025; cursor:pointer; font-size:14px; padding:2px;" title="Delete">&#128465;</button>
                </td>
              </tr>
            `;
          }
          idx++;
        }
        
        html += `</tbody></table></div>`;
        wlItemsContainer.innerHTML = html;

        // Wire up sorting
        const sortPrice = document.getElementById('sort-price');
        const sortMcap = document.getElementById('sort-mcap');
        if (sortPrice) sortPrice.onclick = () => handleSort('price');
        if (sortMcap) sortMcap.onclick = () => handleSort('mcap');

        // Wire up buttons
        wlItemsContainer.querySelectorAll('.screener-del-btn').forEach(b => b.onclick = () => removeTicker(b.getAttribute('data-ticker')));
        wlItemsContainer.querySelectorAll('.screener-note-btn').forEach(b => b.onclick = () => openNoteModal(b.getAttribute('data-ticker')));
        wlItemsContainer.querySelectorAll('.screener-alert-btn').forEach(b => b.onclick = () => openAlertModal(b.getAttribute('data-ticker')));

        // Wire up Drag and Drop
        let draggedRow = null;
        wlItemsContainer.querySelectorAll('.watchlist-row').forEach(row => {
          row.addEventListener('dragstart', function(e) {
            isDragging = true;
            draggedRow = this;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.getAttribute('data-ticker'));
            this.style.opacity = '0.5';
          });
          row.addEventListener('dragend', function() {
            isDragging = false;
            draggedRow = null;
            this.style.opacity = '1';
          });
          row.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
          });
          row.addEventListener('dragenter', function(e) {
            e.preventDefault();
            this.style.background = 'var(--row-hover)';
          });
          row.addEventListener('dragleave', function() {
            this.style.background = '';
          });
          row.addEventListener('drop', function(e) {
            e.stopPropagation();
            this.style.background = '';
            if (draggedRow && draggedRow !== this) {
              const allRows = Array.from(wlItemsContainer.querySelectorAll('.watchlist-row'));
              const fromIdx = allRows.indexOf(draggedRow);
              const toIdx = allRows.indexOf(this);
              
              if (fromIdx >= 0 && toIdx >= 0) {
                // Clear sort visually
                if (currentSortBy) {
                  currentSortBy = null;
                }
                
                // Reorder DOM synchronously before dragend sets draggedRow to null
                const tbody = this.parentNode;
                const rowToMove = draggedRow; // Capture locally
                if (fromIdx < toIdx) {
                  tbody.insertBefore(rowToMove, this.nextSibling);
                } else {
                  tbody.insertBefore(rowToMove, this);
                }
                
                // Build new array based on new DOM order
                const newOrder = Array.from(tbody.querySelectorAll('.watchlist-row')).map(r => r.getAttribute('data-ticker'));
                
                // Save to storage asynchronously
                chrome.storage.local.get(['portfolios', 'screenerWatchlist'], (localRes) => {
                  let p = localRes.portfolios || {};
                  p[activePortfolio] = newOrder;
                  chrome.storage.local.set({ portfolios: p, screenerWatchlist: newOrder }, () => {
                     renderWatchlist();
                  });
                });
              }
            }
            return false;
          });
        });
    });
  }

  // --- Default Search Render (Customizable 4 Pinned Cards) ---
  const defaultPinnedIndices = [
    { key: 'S&P 500 (USA)', symbol: '^GSPC', curr: 'USD' },
    { key: 'NIKKEI (Japan)', symbol: '^N225', curr: 'JPY' },
    { key: 'STI (Singapore)', symbol: '^STI', curr: 'SGD' },
    { key: 'FTSE 100 (UK)', symbol: '^FTSE', curr: 'GBP' }
  ];

  function renderDefaultSearch() {
    chrome.storage.local.get(['pinnedIndices', 'marketIndices'], (res) => {
      const pinned = Array.isArray(res.pinnedIndices) ? res.pinnedIndices : defaultPinnedIndices;
      const indices = res.marketIndices || {};

      let html = `<div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px;">
        <span style="color:var(--label-color); font-size:13px; font-weight:500;">Market Indices</span>
      </div>`;
      html += `<div id="market-indices-container" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">`;

      pinned.forEach((item, slot) => {
        const data = indices[item.key] || {};
        const changeVal = parseFloat(data.changePct || '0');
        const changeColor = changeVal > 0 ? '#188038' : (changeVal < 0 ? '#d93025' : 'var(--label-color)');
        const changeSign = changeVal > 0 ? '&#9650;' : (changeVal < 0 ? '&#9660;' : '');
        const flashClass = data.flash && (Date.now() - (data.flashTime || 0) < 5000) ? (data.flash === 'up' ? 'screener-flash-up' : 'screener-flash-down') : '';

        const displayPrice = data.price || 'Loading...';
        const displayPct = data.changePct ? `${Math.abs(changeVal).toFixed(2)}%` : '0.00%';

        html += `
          <div class="pinned-card" data-slot="${slot}" style="background:var(--verdict-bg); border:1px solid var(--border-color); border-radius:8px; padding:12px 10px; text-align:center; position:relative; cursor:pointer; transition:border-color 0.2s, box-shadow 0.2s;" title="Click to edit ${item.key}">
            <div style="font-weight:600; color:var(--text-color); font-size:13px; margin-bottom:6px; padding:0 14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.key}">${item.key}</div>
            <div class="${flashClass}" style="font-weight:bold; font-size:15px; color:var(--text-color); margin-bottom:4px;">${displayPrice}</div>
            <div style="color:${changeColor}; font-size:11px; font-weight:500;">${changeSign} ${displayPct}</div>
          </div>
        `;
      });
      
      for (let slot = pinned.length; slot < 4; slot++) {
        html += `
          <div class="pinned-card empty-slot" data-slot="${slot}" style="background:var(--verdict-bg); border:1px dashed var(--border-color); border-radius:8px; padding:12px 10px; text-align:center; position:relative; cursor:pointer; display:flex; flex-direction:column; justify-content:center; align-items:center; opacity:0.6; transition:border-color 0.2s, opacity 0.2s;" title="Add a new index or stock">
            <div style="font-size:24px; color:var(--label-color); line-height:1;">+</div>
            <div style="font-size:12px; font-weight:500; color:var(--label-color); margin-top:4px;">Add Ticker</div>
          </div>
        `;
      }

      html += `</div>`;
      
      resultsSearch.innerHTML = html;

      // Wire up card hover and edit modal triggers
      resultsSearch.querySelectorAll('.pinned-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
          card.style.borderColor = 'var(--accent-color, #1a73e8)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.borderColor = 'var(--border-color)';
        });
        card.addEventListener('click', () => {
          const slot = parseInt(card.getAttribute('data-slot'));
          openEditPinnedModal(slot);
        });
      });
    });
  }

  // --- Edit Pinned Card Modal Logic ---
  let editingPinnedSlot = 0;
  const editPinnedModal = document.getElementById('edit-pinned-modal');
  const pinnedDisplayName = document.getElementById('pinned-display-name');
  const pinnedSymbol = document.getElementById('pinned-symbol');
  const btnPinnedCancel = document.getElementById('btn-pinned-cancel');
  const btnPinnedSave = document.getElementById('btn-pinned-save');
  const btnPinnedRemove = document.getElementById('btn-pinned-remove');

  function openEditPinnedModal(slot) {
    editingPinnedSlot = slot;
    chrome.storage.local.get(['pinnedIndices'], (res) => {
      const pinned = Array.isArray(res.pinnedIndices) ? res.pinnedIndices : defaultPinnedIndices;
      const cur = pinned[slot] || { key: '', symbol: '' };
      pinnedDisplayName.value = cur.key || '';
      pinnedSymbol.value = cur.symbol || '';
      if (editPinnedModal) editPinnedModal.style.display = 'flex';
      setTimeout(() => pinnedDisplayName.focus(), 50);
    });
  }

  const presetMap = {
    'NIFTY 50': '^NSEI',
    'BANK NIFTY': '^NSEBANK',
    'SENSEX': '^BSESN',
    'NIFTY IT': '^CNXIT',
    'FIN NIFTY': 'NIFTY_FIN_SERVICE.NS',
    'NIFTY MIDCAP 50': '^NSEMDCP50',
    'NIFTY AUTO': '^CNXAUTO',
    'NIFTY ENERGY': '^CNXENERGY',
    'NIFTY FMCG': '^CNXFMCG',
    'NIFTY PHARMA': '^CNXPHARMA',
    'S&P 500': '^GSPC',
    'NASDAQ': '^IXIC',
    'DOW JONES': '^DJI',
    'RUSSELL 2000': '^RUT',
    'FTSE 100': '^FTSE',
    'NIKKEI 225': '^N225',
    'HANG SENG': '^HSI',
    'Singapore (STI)': '^STI',
    'GOLD Futures': 'GC=F',
    'SILVER Futures': 'SI=F',
    'CRUDE OIL': 'CL=F',
    'Bitcoin': 'BTC-USD',
    'Ethereum': 'ETH-USD',
    'NIFTY METAL': '^CNXMETAL',
    'NIFTY REALTY': '^CNXREALTY',
    'NIFTY PSU BANK': '^CNXPSUBANK',
    'NIFTY MEDIA': '^CNXMEDIA',
    'INDIA VIX': '^INDIAVIX',
    'VIX': '^VIX',
    'DAX': '^GDAXI',
    'CAC 40': '^FCHI',
    'ASX 200': '^AXJO',
    'USD/INR': 'INR=X',
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X'
  };

  if (pinnedDisplayName) {
    pinnedDisplayName.addEventListener('input', () => {
      const val = pinnedDisplayName.value;
      if (presetMap[val]) {
        pinnedSymbol.value = presetMap[val];
      }
    });
  }

  if (pinnedSymbol) {
    pinnedSymbol.addEventListener('input', () => {
      const val = pinnedSymbol.value;
      const nameMatch = Object.keys(presetMap).find(k => presetMap[k] === val);
      if (nameMatch) {
        pinnedDisplayName.value = nameMatch;
      }
    });
  }

  if (btnPinnedCancel && editPinnedModal) {
    btnPinnedCancel.addEventListener('click', () => {
      editPinnedModal.style.display = 'none';
    });
  }

  if (editPinnedModal) {
    editPinnedModal.addEventListener('click', (e) => {
      if (e.target === editPinnedModal) editPinnedModal.style.display = 'none';
    });
  }

  if (btnPinnedRemove) {
    btnPinnedRemove.addEventListener('click', () => {
      chrome.storage.local.get(['pinnedIndices', 'marketIndices'], (res) => {
        let pinned = Array.isArray(res.pinnedIndices) ? [...res.pinnedIndices] : [...defaultPinnedIndices];
        const oldKey = pinned[editingPinnedSlot]?.key;
        
        pinned.splice(editingPinnedSlot, 1); // Remove the item
        
        const marketIndices = res.marketIndices || {};
        if (oldKey) {
          delete marketIndices[oldKey];
        }

        chrome.storage.local.set({ pinnedIndices: pinned, marketIndices }, () => {
          if (editPinnedModal) editPinnedModal.style.display = 'none';
          renderDefaultSearch();
          chrome.runtime.sendMessage({ type: 'POLL_NOW' });
        });
      });
    });
  }

  if (btnPinnedSave) {
    btnPinnedSave.addEventListener('click', () => {
      const name = pinnedDisplayName.value.trim();
      const sym = pinnedSymbol.value.trim();

      if (!name || !sym) {
        alert('Please enter both a Display Name and Symbol.');
        return;
      }

      chrome.storage.local.get(['pinnedIndices', 'marketIndices'], (res) => {
        let pinned = Array.isArray(res.pinnedIndices) ? [...res.pinnedIndices] : [...defaultPinnedIndices];
        const oldKey = pinned[editingPinnedSlot]?.key;
        pinned[editingPinnedSlot] = { key: name, symbol: sym };
        
        const marketIndices = res.marketIndices || {};
        if (oldKey && oldKey !== name) {
          delete marketIndices[oldKey];
        }

        chrome.storage.local.set({ pinnedIndices: pinned, marketIndices }, () => {
          if (editPinnedModal) editPinnedModal.style.display = 'none';
          renderDefaultSearch();
          chrome.runtime.sendMessage({ type: 'POLL_NOW' });
        });
      });
    });
  }

  // --- News Render ---
  function renderNews() {
    chrome.storage.local.get(['portfolios'], async (res) => {
      const list = (res.portfolios || {})[activePortfolio] || [];
      if (list.length === 0) {
        newsContainer.innerHTML = '<div class="screener-loading" style="text-align:center; padding:20px;">Fetching US Macro News...</div>';
        try {
          const feedRes = await fetch(`https://news.google.com/rss/search?q=US+Economy+OR+Federal+Reserve+OR+S%26P+500&hl=en-US&gl=US&ceid=US:en`);
          const text = await feedRes.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'text/xml');
          const items = Array.from(xml.querySelectorAll('item')).slice(0, 6);
          
          if (items.length > 0) {
            let allNewsHtml = `<div style="font-size:12px; font-weight:bold; color:var(--accent-color, #1a73e8); margin-top:12px; margin-bottom:4px; padding:0 12px;">US MACRO NEWS</div>`;
            items.forEach(item => {
              const title = item.querySelector('title')?.textContent || '';
              const link = item.querySelector('link')?.textContent || '';
              const pubDate = item.querySelector('pubDate')?.textContent || '';
              const source = item.querySelector('source')?.textContent || 'Google News';
              const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : '';
              
              allNewsHtml += `
                <div style="padding: 12px; border-bottom: 1px solid var(--border-color);">
                  <a href="${link}" target="_blank" style="color:var(--text-color); text-decoration:none; font-size:14px; display:block; margin-bottom:4px;">${title}</a>
                  <div style="font-size:11px; color:var(--label-color);">${source} &bull; ${dateStr}</div>
                </div>
              `;
            });
            newsContainer.innerHTML = allNewsHtml;
            return;
          }
        } catch (e) {
          console.error('US Macro News error', e);
        }
        newsContainer.innerHTML = '<div style="text-align:center;color:var(--label-color);padding:20px;">No stocks in this portfolio to fetch news for.</div>';
        return;
      }
      
      newsContainer.innerHTML = '<div class="screener-loading" style="text-align:center; padding:20px;">Fetching latest financial news...</div>';
      
      let allNewsHtml = '';
      const results = await Promise.all(list.slice(0, 15).map(async (ticker) => {
          try {
            const feedRes = await fetch(`https://news.google.com/rss/search?q=${ticker}+stock&hl=en-IN&gl=IN&ceid=IN:en`);
            const text = await feedRes.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const items = Array.from(xml.querySelectorAll('item')).slice(0, 2);
            let html = '';
            
            if (items.length > 0) {
              html += `<div style="font-size:12px; font-weight:bold; color:var(--accent-color, #1a73e8); margin-top:12px; margin-bottom:4px; padding:0 12px;">${ticker} NEWS</div>`;
              items.forEach(item => {
                const title = item.querySelector('title')?.textContent || '';
                const link = item.querySelector('link')?.textContent || '';
                const pubDate = item.querySelector('pubDate')?.textContent || '';
                const source = item.querySelector('source')?.textContent || 'Google News';
                const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : '';
                
                html += `
                  <div style="padding: 12px; border-bottom: 1px solid var(--border-color);">
                    <a href="${link}" target="_blank" style="color:var(--text-color); text-decoration:none; font-size:14px; display:block; margin-bottom:4px;">${title}</a>
                    <div style="font-size:11px; color:var(--label-color);">${source} &bull; ${dateStr}</div>
                  </div>
                `;
              });
            }
            return html;
          } catch (e) {
            console.error('News error for', ticker, e);
            return '';
          }
      }));
      allNewsHtml = results.join('');
      
      if (allNewsHtml === '') {
        newsContainer.innerHTML = '<div style="text-align:center;color:#6c757d;padding:20px;">No recent news found for your portfolio.</div>';
      } else {
        newsContainer.innerHTML = allNewsHtml;
      }
    });
  }




  // Listen for background updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'WATCHLIST_UPDATED') {
       if (tabSearch.classList.contains('active')) {
         renderWatchlist();
         if (!inputSearch.value.trim() && resultsSearch.querySelector('#market-indices-container')) {
           renderDefaultSearch();
         }
       }
    }
  });

  // --- Autocomplete Logic with Keyboard Navigation ---
  let debounceTimer;
  let activeIndex = -1;

  function highlightItem(container, index) {
    const items = container.querySelectorAll('.screener-suggestion-item');
    items.forEach((el, i) => {
      el.style.backgroundColor = i === index ? '#e8eaed' : '';
      if (document.body.classList.contains('dark-mode')) {
        el.style.backgroundColor = i === index ? '#3c4043' : '';
      }
    });
  }

  async function handleInput(e, suggestionsContainer, inputElement, actionBtn) {
    clearTimeout(debounceTimer);
    activeIndex = -1;
    const query = inputElement.value.trim();
    if (query.length < 2) {
      suggestionsContainer.style.display = 'none';
      if (query.length === 0 && inputElement === inputSearch) {
        renderDefaultSearch();
      }
      return;
    }
      debounceTimer = setTimeout(async () => {
        try {
          const results = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'SEARCH_COMPANY', query: query }, resolve);
          });
          if (results && results.length > 0) {
          suggestionsContainer.innerHTML = '';
          results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'screener-suggestion-item';
            const itemType = item.type || 'Stock';
            div.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <span style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">${item.name}</span>
                <span style="font-size:10px; padding:2px 6px; border-radius:4px; background:var(--verdict-bg, #f1f3f4); color:var(--text-color, #3c4043); border:1px solid var(--border-color, #dadce0); flex-shrink:0;">${itemType}</span>
              </div>
            `;
            div.dataset.ticker = item.ticker || (item.url ? item.url.split('/')[2] : item.name);
            div.onclick = () => {
              inputElement.value = div.dataset.ticker;
              suggestionsContainer.style.display = 'none';
              activeIndex = -1;
              if (actionBtn) actionBtn.click();
            };
            suggestionsContainer.appendChild(div);
          });
          suggestionsContainer.style.display = 'block';
        }
      } catch (err) {}
    }, 300);
  }

  function handleKeydown(e, suggestionsContainer, inputElement, actionBtn) {
    const items = suggestionsContainer.querySelectorAll('.screener-suggestion-item');
    if (!items.length || suggestionsContainer.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      highlightItem(suggestionsContainer, activeIndex);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightItem(suggestionsContainer, activeIndex);
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < items.length) {
        items[activeIndex].click();
      } else if (items.length > 0) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      suggestionsContainer.style.display = 'none';
      activeIndex = -1;
    }
  }

  inputSearch.addEventListener('input', (e) => handleInput(e, searchSuggestions, inputSearch, btnSearch));
  inputSearch.addEventListener('keydown', (e) => handleKeydown(e, searchSuggestions, inputSearch, btnSearch));

  // WL search logic removed

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.screener-search-container')) {
      if (searchSuggestions) searchSuggestions.style.display = 'none';
      if (wlSuggestions) wlSuggestions.style.display = 'none';
      activeIndex = -1;
    }
  });

});



// --- Sparklines SVG Builder ---
async function buildSparkline(ticker) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?range=7d&interval=1d`);
    const data = await res.json();
    const prices = data.chart.result[0].indicators.quote[0].close.filter(p => p !== null);
    if (prices.length < 2) return '';

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    const width = 60;
    const height = 20;
    
    const points = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? '#188038' : '#d93025';

    return `<svg width="${width}" height="${height}" style="margin-top:4px;"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}"/></svg>`;
  } catch(e) {
    return '';
  }
}
// Keep background worker alive and trigger ultra-fast price polling
setInterval(() => {
  try {
    chrome.runtime.sendMessage({ type: 'PING' }, () => {
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  } catch(e) {}
}, 1000);








