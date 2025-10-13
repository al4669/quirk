// URL utility functions
class UrlUtils {
  static convertToGitHubRawUrl(url) {
    try {
      // Handle different GitHub URL formats
      if (url.includes('github.com')) {
        // Convert github.com URLs to raw.githubusercontent.com
        const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/;
        const match = url.match(githubRegex);

        if (match) {
          const [, user, repo, branch, path] = match;
          return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
        }
      } else if (url.includes('raw.githubusercontent.com')) {
        // Already a raw URL
        return url;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  static clearUrlParameter(paramName = 'board') {
    // Remove a URL parameter without refreshing the page
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location);
      url.searchParams.delete(paramName);
      window.history.replaceState({}, document.title, url.toString());
    }
  }
}
