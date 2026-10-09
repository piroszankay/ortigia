const overlay = document.getElementById('overlay')!;

export function showOverlay(html: string) {
  overlay.innerHTML = `<div class="card">${html}</div>`;
  overlay.hidden = false;
}

export function hideOverlay() {
  overlay.hidden = true;
  overlay.innerHTML = '';
}
