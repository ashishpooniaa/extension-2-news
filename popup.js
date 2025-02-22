// Add validation functions at the top
function isValidUrl(url) {
  const urlPattern = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;
  return urlPattern.test(url);
}

function isValidTitle(title) {
  const titlePattern = /^(?!\s)(?!.*\s$)[A-Za-z0-9\s\-_.,!?'"()[\]{}:;/@#$%^&*+=|~`<>€£¥§±]{1,300}$/;
  return titlePattern.test(title);
}

// Add new functions for URL and title processing
function processNewsUrl(url) {
  try {
    // Remove any trailing slashes and clean the URL
    return url.replace(/\/$/, '').trim();
  } catch (error) {
    console.error('Error processing URL:', error);
    return url;
  }
}

function extractNewsTitle(document, url) {                            
  try {
    // Try Open Graph title first (og:title)
    let title = document.querySelector('meta[property="og:title"]')?.content;
    
    // If no og:title, try Schema.org Article headline
    if (!title) {
      title = document.querySelector('meta[property="article:title"]')?.content ||
              document.querySelector('meta[name="title"]')?.content ||
              document.querySelector('h1[class*="headline"], h1[class*="title"]')?.textContent?.trim();
    }

    // If still no title, try main heading or document title
    if (!title) {
      title = document.querySelector('h1')?.textContent?.trim() || document.title;
    }

    // Clean the title
    if (title) {
      title = title.replace(/\s+/g, ' ').trim(); // Remove extra spaces
      title = title.replace(/[^\w\s\-.,!?'"()[\]{}:;/@#$%^&*+=|~`<>€£¥§±]/g, ''); // Remove invalid chars
    }

    return title || 'Untitled Article';
  } catch (error) {
    console.error('Error extracting title:', error);
    return 'Untitled Article';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const articlesList = document.getElementById('articlesList');
  const storiesList = document.getElementById('storiesList');
  const articlesLoading = document.getElementById('articlesLoading');
  const storiesLoading = document.getElementById('storiesLoading');

  let currentPageArticles = [];

  // Listen for dynamic content updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'contentUpdated' && request.articles) {
      currentPageArticles = request.articles;
      // Refresh the displayed articles with new images
      refreshArticleImages();
    }
  });

  function refreshArticleImages() {
    // Update images in existing articles
    document.querySelectorAll('#articlesList li, #storiesList li').forEach(li => {
      const title = li.querySelector('.article-title').textContent;
      const pageArticle = currentPageArticles.find(a => a.title === title);
      if (pageArticle?.imageUrl) {
        const imgContainer = li.querySelector('.article-image');
        if (imgContainer.classList.contains('no-image')) {
          imgContainer.className = 'article-image';
          imgContainer.textContent = '';
          const img = document.createElement('img');
          img.className = 'article-image';
          img.src = pageArticle.imageUrl;
          img.alt = title;
          img.onerror = function() {
            this.parentNode.className = 'article-image no-image';
            this.parentNode.textContent = 'No Image';
            this.remove();
          };
          imgContainer.appendChild(img);
        }
      }
    });
  }

  // Get current tab URL and extract article data
  chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
    if (!tabs || !tabs[0]) {
      showError('Could not access current tab', articlesList);
      return;
    }

    const currentUrl = tabs[0].url;
    console.log("currentUrl----", currentUrl);

    // Check if we can inject content script
    if (!currentUrl || currentUrl.startsWith('chrome://') || currentUrl.startsWith('edge://')) {
      showError('Cannot access this page', articlesList);
      return;
    }
    
    try {
      // Inject content script manually if not already injected
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }).catch(() => {
        console.log('Content script already injected or injection failed');
      });

      // Get article data from content script with timeout
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const messagePromise = new Promise((resolve) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getArticleData' }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('Message error:', chrome.runtime.lastError);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });

      const response = await Promise.race([messagePromise, timeout]).catch(() => null);

      if (response && response.articles) {
        currentPageArticles = response.articles;
        fetchSimilarArticles(currentUrl, currentPageArticles);
        // fetchSimilarStories(currentUrl, currentPageArticles);
      } else {
        // Proceed without images if content script communication fails
        fetchSimilarArticles(currentUrl);
        // fetchSimilarStories(currentUrl);
      }
    } catch (error) {
      console.error('Error:', error);
      // Proceed without images if there's an error
      fetchSimilarArticles(currentUrl);
      // fetchSimilarStories(currentUrl);
    }
  });

  function createArticleElement(item, isStory = false) {
    if (!isValidTitle(item.title)) {
      console.warn('Invalid title format:', item.title);
      item.title = 'Untitled'; // fallback for invalid titles
    }
    
    const li = document.createElement('li');
    
    // Create image container
    const imgContainer = document.createElement('div');
    imgContainer.className = 'article-image no-image';
    
    if (item.imageUrl) {
      const img = document.createElement('img');
      img.className = 'article-image';
      img.src = item.imageUrl;
      img.alt = item.title;
      img.onerror = function() {
        this.parentNode.className = 'article-image no-image';
        this.parentNode.textContent = 'No Image';
        this.remove();
      };
      // Add loading="lazy" for better performance
      img.loading = 'lazy';
      imgContainer.className = 'article-image';
      imgContainer.appendChild(img);
    } else {
      imgContainer.textContent = 'No Image';
    }

    // Create content container
    const content = document.createElement('div');
    content.className = 'article-content';

    // Create title
    const title = document.createElement('div');
    title.className = 'article-title';
    title.textContent = item.title;
    content.appendChild(title);

    // Add score for stories
    if (isStory && typeof item.score !== 'undefined') {
      const scoreSpan = document.createElement('small');
      scoreSpan.textContent = `Relevance: ${Math.round(item.score * 100)}%`;
      content.appendChild(scoreSpan);
    }

    // Append elements to li
    li.appendChild(imgContainer);
    li.appendChild(content);

    // Add click handler
    li.addEventListener('click', () => {
      chrome.tabs.create({ url: item.url });
    });

    return li;
  }

  console.log("document.title----", document.title);

  async function fetchSimilarArticles(url, pageArticles = []) {
    if (!isValidUrl(url)) {
      showError('Invalid URL format', articlesList);
      return;
    }
    
    try {
      // Process URL and get title from the page
      const processedUrl = processNewsUrl(url);
      
      // Get the document from the active tab
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      const [{result: pageDocument}] = await chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: () => document.documentElement.outerHTML
      });
      
      // Create a temporary DOM parser
      const parser = new DOMParser();
      const doc = parser.parseFromString(pageDocument, 'text/html');
      
      // Extract title using our enhanced function
      const processedTitle = extractNewsTitle(doc, url);
      
      const response = await fetch(`http://192.168.31.142:3000/api/similarArticles?url=${encodeURIComponent(processedUrl)}&title=${encodeURIComponent(processedTitle)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      });
      const data = await response.json();
      
      articlesLoading.style.display = 'none';
      
      if (data.similarItems && data.similarItems.length > 0) {
        data.similarItems.forEach(article => {
          // Try to find matching article from the page to get its image
          const pageArticle = pageArticles.find(a => 
            a.url === article.url || 
            a.title === article.title ||
            article.title.includes(a.title) ||
            a.title.includes(article.title)
          );
          if (pageArticle && pageArticle.imageUrl) {
            article.imageUrl = pageArticle.imageUrl;
          }
          articlesList.appendChild(createArticleElement(article));
        });
      } else {
        showError('this page is not news page', articlesList);
      }
    } catch (error) {
      showError('Failed to fetch similar articles', articlesList);
    }
  }

  // async function fetchSimilarStories(url, pageArticles = []) {
  //   try {
  //     const response = await fetch(`http://localhost:3000/api/similarStory?url=${encodeURIComponent(url)}`, {
  //       method: 'GET',
  //       headers: {
  //         'Accept': 'application/json',
  //         'Content-Type': 'application/json'
  //       },
  //       mode: 'cors'
  //     });
  //     const data = await response.json();
      
  //     storiesLoading.style.display = 'none';
      
  //     if (data.similarStories && data.similarStories.length > 0) {
  //       data.similarStories
  //         .sort((a, b) => b.score - a.score)
  //         .forEach(story => {
  //           // Try to find matching article from the page to get its image
  //           const pageArticle = pageArticles.find(a => 
  //             a.url === story.url || 
  //             a.title === story.title ||
  //             story.title.includes(a.title) ||
  //             a.title.includes(story.title)
  //           );
  //           if (pageArticle && pageArticle.imageUrl) {
  //             story.imageUrl = pageArticle.imageUrl;
  //           }
  //           storiesList.appendChild(createArticleElement(story, true));
  //         });
  //     } else {
  //       showError('No similar stories found', storiesList);
  //     }
  //   } catch (error) {
  //     showError('Failed to fetch similar stories', storiesList);
  //   }
  // }

  function showError(message, container) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    container.parentNode.insertBefore(errorDiv, container);
  }
}); 