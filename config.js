// Set this to the public base URL of the Node API; keep database credentials on the server.
window.EETDAGBOEK_API_BASE_URL = '';

window.eetdagboekApiUrl = function (path) {
    const baseUrl = window.EETDAGBOEK_API_BASE_URL.replace(/\/+$/, '');
    return `${baseUrl}${path}`;
};
