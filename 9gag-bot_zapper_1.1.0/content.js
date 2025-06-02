// RAW URL of public blacklist.json Gist.
const BLACKLIST_REMOTE_URL = 'https://gist.githubusercontent.com/LogosaurusLTD/9651fe254709cdcc763d1528210f6244/raw/blacklist.json';

const CACHE_DURATION_MS = 3600 * 1000; // 1 hour

let blacklistDataByLevel = new Map(); 
let currentBlockingLevel = 'medium'; 

let sessionHiddenPosts = 0; 
let allTimeHiddenPosts = 0; 

function injectCSS() {
    const styleId = '9gag-blacklist-hider-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .9gag-blacklisted-hidden { }
            .9gag-stream-hidden { }

            /* NEW: Aggressively reclaim space from stream-containers using !important CSS */
            div.stream-container {
                min-height: 0px !important; /* Force min-height to 0 */
                height: auto !important;    /* Allow height to shrink to content */
            }
        `;
        document.head.appendChild(style);
        console.log('[9GAG Bot Zapper] Injected semantic and layout-fixing CSS.');
    }
}


async function loadBlacklist() {
    try {
        const now = Date.now();
        let cachedData = null;
        let storedEtag = null;
        let storedLastModified = null;

        const stored = await chrome.storage.local.get(['blacklistFullDataByLevel', 'blacklistTimestamp', 'blacklistEtag', 'blacklistLastModified']);

        if (stored.blacklistFullDataByLevel && stored.blacklistTimestamp) {
            const age = now - stored.blacklistTimestamp;
            if (age < CACHE_DURATION_MS) {
                cachedData = stored.blacklistFullDataByLevel;
            } else {
                storedEtag = stored.blacklistEtag;
                storedLastModified = stored.blacklistLastModified;
            }
        }

        let fetchedBlacklistData;

        if (cachedData) {
            fetchedBlacklistData = cachedData;
        } else {
            const headers = new Headers();
            if (storedEtag) {
                headers.append('If-None-Match', storedEtag);
            }
            if (storedLastModified) {
                headers.append('If-Modified-Since', storedLastModified);
            }

            const response = await fetch(BLACKLIST_REMOTE_URL, { headers: headers });

            if (response.status === 304) {
                fetchedBlacklistData = stored.blacklistFullDataByLevel;
                await chrome.storage.local.set({ blacklistTimestamp: now });
                console.log('[9GAG Bot Zapper] Blacklist not modified, using cached version.');
            } else if (response.ok) {
                fetchedBlacklistData = await response.json();
                const newEtag = response.headers.get('ETag');
                const newLastModified = response.headers.get('Last-Modified');
                await chrome.storage.local.set({
                    blacklistFullDataByLevel: fetchedBlacklistData,
                    blacklistTimestamp: now,
                    blacklistEtag: newEtag, 
                    blacklistLastModified: newLastModified 
                });
                console.log('[9GAG Bot Zapper] Blacklist fetched and updated from remote URL.');
            } else {
                console.error(`[9GAG Bot Zapper] HTTP error fetching blacklist: ${response.status}`);
                if (stored.blacklistFullDataByLevel) {
                    fetchedBlacklistData = stored.blacklistFullDataByLevel;
                    console.warn('[9GAG Bot Zapper] Failed to fetch new blacklist, using stale cached data.');
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            }
        }

        blacklistDataByLevel.clear();
        let totalBlacklistedPostsCount = 0;
        for (const levelKey in fetchedBlacklistData) {
            if (Object.hasOwnProperty.call(fetchedBlacklistData, levelKey)) {
                const postIds = fetchedBlacklistData[levelKey];
                if (Array.isArray(postIds)) {
                    blacklistDataByLevel.set(levelKey, new Set(postIds));
                    totalBlacklistedPostsCount += postIds.length;
                    console.log(`[9GAG Bot Zapper] Populated ${levelKey} with ${postIds.length} posts.`);
                } else {
                    console.warn(`[9GAG Bot Zapper] Invalid data for level ${levelKey}: Expected array, got`, postIds);
                }
            }
        }
        console.log(`[9GAG Bot Zapper] Blacklist loaded. Total unique blacklisted posts across all levels: ${totalBlacklistedPostsCount}.`);
        console.log('[9GAG Bot Zapper] Current blacklistDataByLevel Map content:', blacklistDataByLevel);

    } catch (error) {
        console.error('[9GAG Bot Zapper] CRITICAL: Failed to load or process blacklist:', error);
        blacklistDataByLevel.clear();
    }
}
async function getBlockingLevel() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({
            blockingLevel: 'medium'
        }, (items) => {
            currentBlockingLevel = items.blockingLevel;
            console.log(`[9GAG Bot Zapper] Current blocking level set to: ${currentBlockingLevel}`);
            resolve(currentBlockingLevel);
        });
    });
}

function shouldHidePost(postId, selectedBlockingLevel) {
    let hide = false;
    let matchingLevel = null;

    if (blacklistDataByLevel.get('Level 1')?.has(postId)) {
        matchingLevel = 1;
    } else if (blacklistDataByLevel.get('Level 2')?.has(postId)) {
        matchingLevel = 2;
    } else if (blacklistDataByLevel.get('Level 3')?.has(postId)) {
        matchingLevel = 3;
    }

    if (matchingLevel !== null) {
        switch (selectedBlockingLevel) {
            case 'low':
                hide = matchingLevel === 1;
                break;
            case 'medium':
                hide = matchingLevel <= 2;
                break;
            case 'high':
                hide = matchingLevel <= 3;
                break;
            default:
                hide = false;
        }
        console.log(`[9GAG Bot Zapper] Post ID: ${postId} | Matched Level: ${matchingLevel} | Selected Blocking Level: ${selectedBlockingLevel} | Should Hide: ${hide}`);
    } else {
    }

    return hide;
}

async function loadCounters() {
    try {
        const stored = await chrome.storage.local.get(['allTimeHiddenPosts']);
        allTimeHiddenPosts = stored.allTimeHiddenPosts || 0;
        console.log(`[9GAG Bot Zapper] Counters loaded: Session: ${sessionHiddenPosts}, All-Time: ${allTimeHiddenPosts}`);
    } catch (error) {
        console.error('[9GAG Bot Zapper] Failed to load counters from local storage:', error);
        allTimeHiddenPosts = 0;
    }
}

let saveTimeout;
async function saveAllTimeCounter() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await chrome.storage.local.set({ allTimeHiddenPosts: allTimeHiddenPosts });
            console.log(`[9GAG Bot Zapper] All-time counter saved: ${allTimeHiddenPosts}`);
        } catch (error) {
            console.error('[9GAG Bot Zapper] Failed to save all-time counter to local storage:', error);
        }
    }, 500); 
}

function hideBlacklistedContent() {
    console.log("[9GAG Bot Zapper] Running content removal logic...");

    if (blacklistDataByLevel.size === 0) {
        console.warn("[9GAG Bot Zapper] Blacklist data is empty. No posts will be hidden.");
        return;
    }

    const streamContainers = document.querySelectorAll('div.stream-container');
    console.log(`[9GAG Bot Zapper] Found ${streamContainers.length} stream containers.`);

    streamContainers.forEach(streamContainer => {
        let hasVisibleArticles = false;

        streamContainer.style.removeProperty('min-height');
        streamContainer.style.removeProperty('height');
        streamContainer.style.removeProperty('--662c6048');

        streamContainer.style.minHeight = '0px';
        streamContainer.style.height = 'auto';

        const postsInStream = streamContainer.querySelectorAll('article[id^="jsid-post-"]');

        Array.from(postsInStream).forEach(post => {
            let postIdToCheck = null;

            if (post.id && post.id.startsWith('jsid-post-')) {
                postIdToCheck = post.id.replace('jsid-post-', '');
            } else {
                const postLinkElement = post.querySelector('a[href*="/gag/"]');
                if (postLinkElement && postLinkElement.dataset.entryId) {
                    postIdToCheck = postLinkElement.dataset.entryId;
                } else if (postLinkElement) {
                    const parsedUrl = new URL(postLinkElement.href);
                    postIdToCheck = parsedUrl.pathname.split('/').pop();
                }
            }
            if (postIdToCheck) {
                if (shouldHidePost(postIdToCheck, currentBlockingLevel)) {
                    if (post.parentNode) {
                        post.remove();
                        post.classList.add('9gag-blacklisted-hidden');
                        console.log(`[9GAG Bot Zapper] HIDDEN: Post with ID: ${postIdToCheck}`);

                        sessionHiddenPosts++;
                        allTimeHiddenPosts++;
                        saveAllTimeCounter();
                        console.log(`[9GAG Bot Zapper] Current counters: Session: ${sessionHiddenPosts}, All-Time: ${allTimeHiddenPosts}`);
                    }
                } else {
                    hasVisibleArticles = true;
                }
            } else {
                console.warn("[9GAG Bot Zapper] Could not extract postId for a post in stream:", post);
            }
        });

        streamContainer.style.removeProperty('min-height');
        streamContainer.style.removeProperty('height');
        streamContainer.style.removeProperty('--662c6048');

        if (!hasVisibleArticles) {
            if (streamContainer.parentNode) {
                streamContainer.remove();
                streamContainer.classList.add('9gag-stream-hidden');
                console.log(`[9GAG Bot Zapper] REMOVED STREAM CONTAINER (no visible articles):`, streamContainer);
            }
        } else {
            streamContainer.classList.remove('9gag-stream-hidden');
            if (streamContainer.style.display === 'none') {
                streamContainer.style.display = '';
                streamContainer.style.minHeight = '';
                streamContainer.style.height = '';
            }
        }
    });
    console.log("[9GAG Bot Zapper] Content removal logic completed.");
}

const observer = new MutationObserver((mutations) => {
    const relevantChange = mutations.some(mutation =>
        (mutation.type === 'childList' &&
         Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE && (node.matches('.stream-container') || node.querySelector('.stream-container') || node.matches('article[id^="jsid-post-"]') || node.querySelector('article[id^="jsid-post-"]')))
        ) ||
        (mutation.type === 'childList' &&
         Array.from(mutation.removedNodes).some(node => node.nodeType === Node.ELEMENT_NODE && (node.matches('.stream-container') || node.querySelector('.stream-container') || node.matches('article[id^="jsid-post-"]') || node.querySelector('article[id^="jsid-post-"]')))
        )
    );
    if (relevantChange) {
        console.log('[9GAG Bot Zapper] DOM change detected, re-running content removal.');
        hideBlacklistedContent();
    }
});

injectCSS();

getBlockingLevel().then(() => {
    loadBlacklist().then(() => {
        loadCounters().then(() => { 
            hideBlacklistedContent();
            console.log('[9GAG Bot Zapper] Starting DOM observer.');
            observer.observe(document.body, { childList: true, subtree: true });
        });
    });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.blockingLevel) {
        console.log('[9GAG Bot Zapper] Blocking level changed (from options), re-applying filters...');
        getBlockingLevel().then(() => {
            hideBlacklistedContent();
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSessionHiddenPosts") {
        sendResponse({ sessionCount: sessionHiddenPosts });
        return true;
    }
});