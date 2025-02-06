document.addEventListener('DOMContentLoaded', function() {
  const articlesList = document.getElementById('articlesList');
  const loading = document.getElementById('loading');

  // Get current tab URL
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentUrl = tabs[0].url;
    console.log("currentUrl----",currentUrl);
    fetchSimilarArticles(currentUrl);
  });

  async function fetchSimilarArticles(url) {
    try {
      const response = await fetch(`http://localhost:3000/api/similarArticles?url=${encodeURIComponent(url)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        mode: 'cors'
      });
      const data = await response.json();
      
      loading.style.display = 'none';
      
      if (data.similarItems && data.similarItems.length > 0) {
        data.similarItems.forEach(article => {
          const li = document.createElement('li');
          li.textContent = article.title;
          li.addEventListener('click', () => {
            chrome.tabs.create({ url: article.url });
          });
          articlesList.appendChild(li);
        });
      } else {
        showError('No similar articles found');
      }
    } catch (error) {
      showError('Failed to fetch similar articles');
    }
  }

  function showError(message) {
    loading.style.display = 'none';
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    articlesList.parentNode.insertBefore(errorDiv, articlesList);
  }
}); 