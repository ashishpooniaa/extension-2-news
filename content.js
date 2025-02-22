function createSimilarArticleElement(article) {
    const articleContainer = document.createElement('div');
    articleContainer.className = 'similar-article-container';

    // Create and set up image element
    const imageElement = document.createElement('img');
    imageElement.className = 'similar-article-image';
    imageElement.src = article.imageUrl || 'default-placeholder.png';
    imageElement.alt = article.title;
    
    // Create title element
    const titleElement = document.createElement('a');
    titleElement.className = 'similar-article-title';
    titleElement.href = article.url;
    titleElement.textContent = article.title;

    // Add elements to container
    articleContainer.appendChild(imageElement);
    articleContainer.appendChild(titleElement);
    
    return articleContainer;
}

function getSimilarArticles() {
    const articles = document.querySelectorAll('article, .article-card, .story-card'); // adjust selector based on website structure
    
    return Array.from(articles).map(article => {
        const imageElement = article.querySelector('img');
        const linkElement = article.querySelector('a');
        
        return {
            title: linkElement?.textContent || '',
            url: linkElement?.href || '',
            imageUrl: imageElement?.src || '',
        };
    });
}

// Function to extract image from an article element
function extractImageFromArticle(articleElement) {
  // Array of common image selectors
  const imageSelectors = [
    'img[src*="article"]',
    'img[src*="news"]',
    'img[src*="story"]',
    'img[src*="media"]',
    'img[src*="photo"]',
    'img[src*="images"]',
    'img[data-src]', // For lazy loaded images
    'img[data-lazy-src]',
    'img[data-original]',
    '.article-image img',
    '.story-image img',
    '.featured-image img',
    '.thumbnail img',
    'picture source',
    '[style*="background-image"]'
  ];

  // Try each selector
  for (const selector of imageSelectors) {
    const elements = articleElement.querySelectorAll(selector);
    for (const element of elements) {
      let imageUrl = null;

      // Check for different image source attributes
      if (element.tagName.toLowerCase() === 'img') {
        imageUrl = element.getAttribute('src') ||
                  element.getAttribute('data-src') ||
                  element.getAttribute('data-lazy-src') ||
                  element.getAttribute('data-original');
        
        // Skip small icons
        if (imageUrl && (element.width > 60 || element.height > 60 || !element.width || !element.height)) {
          return imageUrl;
        }
      }
      // Handle picture source elements
      else if (element.tagName.toLowerCase() === 'source') {
        imageUrl = element.getAttribute('srcset')?.split(',')[0]?.split(' ')[0] ||
                  element.getAttribute('data-srcset')?.split(',')[0]?.split(' ')[0];
        if (imageUrl) return imageUrl;
      }
      // Handle background images
      else if (element.style?.backgroundImage) {
        imageUrl = element.style.backgroundImage.replace(/^url\(['"](.+)['"]\)$/, '$1');
        if (imageUrl !== 'none') return imageUrl;
      }
    }
  }

  // Try to find any large enough image if previous attempts failed
  const allImages = articleElement.getElementsByTagName('img');
  for (const img of allImages) {
    if (img.width > 60 || img.height > 60 || !img.width || !img.height) {
      const src = img.getAttribute('src') ||
                 img.getAttribute('data-src') ||
                 img.getAttribute('data-lazy-src');
      if (src) return src;
    }
  }

  return null;
}

// Function to extract article data including images
function extractArticleData() {
  const articles = [];
  
  // Expanded list of article selectors
  const articleSelectors = [
    'article',
    '[class*="article"]',
    '[class*="story"]',
    '.news-item',
    '.entry-content',
    '.post',
    '.news-card',
    '.story-card',
    '.content-card',
    '[itemtype*="Article"]',
    '[role="article"]',
    '.article-body',
    '.story-body'
  ];

  // Find all possible article containers
  const articleElements = document.querySelectorAll(articleSelectors.join(','));
  
  articleElements.forEach(article => {
    // Expanded list of title selectors
    const titleSelectors = [
      'h1', 'h2', 'h3',
      '[class*="title"]',
      '[class*="headline"]',
      'a[class*="title"]',
      'a[class*="headline"]',
      '.article-title',
      '.story-title',
      '.entry-title'
    ];

    // Find title and link
    const titleElement = article.querySelector(titleSelectors.join(','));
    if (!titleElement) return;
    
    const title = titleElement.textContent.trim();
    const url = titleElement.href || titleElement.closest('a')?.href;
    
    // Extract image
    const imageUrl = extractImageFromArticle(article);
    
    if (title && url) {
      articles.push({
        title,
        url,
        imageUrl
      });
    }
  });
  
  return articles;
}

// Initialize observer for dynamic content
let lastArticleCount = 0;
const observer = new MutationObserver((mutations) => {
  const currentArticleCount = document.querySelectorAll('article, [class*="article"], [class*="story"]').length;
  if (currentArticleCount !== lastArticleCount) {
    lastArticleCount = currentArticleCount;
    // Notify the extension of new content
    chrome.runtime.sendMessage({
      action: 'contentUpdated',
      articles: extractArticleData()
    });
  }
});

// Start observing dynamic changes
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['src', 'data-src', 'style']
});

// Send article data to the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getArticleData') {
    sendResponse({ articles: extractArticleData() });
  }
  return true;
}); 