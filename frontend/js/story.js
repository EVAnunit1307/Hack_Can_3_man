(function () {
  const modal = document.getElementById('story-modal');
  const titleEl = document.getElementById('story-modal-title');
  const characterEl = document.getElementById('story-character');
  const statusEl = document.getElementById('story-status');
  const audioEl = document.getElementById('story-audio');
  const closeBtn = modal?.querySelector('.story-modal__close');
  const backdrop = modal?.querySelector('.story-modal__backdrop');

  if (!modal || !audioEl) return;

  function openModal(recipeId, recipeName, ingredientsParam) {
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('story-modal--open');
    titleEl.textContent = recipeName ? 'Story: ' + recipeName : 'Story';
    characterEl.classList.remove('story-character--speaking');
    statusEl.textContent = 'Loading story…';
    statusEl.classList.remove('story-modal__status--error');
    audioEl.removeAttribute('src');
    audioEl.pause();

    let audioUrl = window.location.origin + '/api/story-audio?recipeId=' + encodeURIComponent(recipeId);
    if (ingredientsParam) audioUrl += '&ingredients=' + ingredientsParam;

    fetch(audioUrl)
      .then(function (res) {
        if (!res.ok) return res.json().then(function (data) { throw new Error(data.error || 'Server error ' + res.status); });
        return res.blob();
      })
      .then(function (blob) {
        const url = URL.createObjectURL(blob);
        audioEl.src = url;
        audioEl.addEventListener('canplaythrough', onCanPlay, { once: true });
        audioEl.addEventListener('error', onAudioError, { once: true });
        audioEl.addEventListener('ended', onEnded, { once: true });
        statusEl.textContent = 'Preparing audio…';
        audioEl.load();
      })
      .catch(function (err) {
        statusEl.textContent = err.message || 'Story audio could not be loaded.';
        statusEl.classList.add('story-modal__status--error');
      });

    function onCanPlay() {
      statusEl.textContent = 'Listen to how this food connects to Indigenous communities.';
      characterEl.classList.add('story-character--speaking');
      audioEl.play().catch(function () {
        statusEl.textContent = 'Click play to start.';
        characterEl.classList.remove('story-character--speaking');
      });
    }
    function onAudioError() {
      statusEl.textContent = 'Audio failed to play.';
      statusEl.classList.add('story-modal__status--error');
      characterEl.classList.remove('story-character--speaking');
    }
    function onEnded() {
      characterEl.classList.remove('story-character--speaking');
      statusEl.textContent = 'Story finished. Thanks for listening.';
    }
  }

  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('story-modal--open');
    audioEl.pause();
    if (audioEl.src && audioEl.src.indexOf('blob:') === 0) URL.revokeObjectURL(audioEl.src);
    audioEl.removeAttribute('src');
    characterEl.classList.remove('story-character--speaking');
  }

  closeBtn && closeBtn.addEventListener('click', closeModal);
  backdrop && backdrop.addEventListener('click', closeModal);
  modal && modal.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.story-btn');
    if (!btn) return;
    const recipeId = btn.getAttribute('data-recipe-id');
    const recipeName = btn.getAttribute('data-recipe-name') || '';
    const section = btn.closest('.suggested-recipes');
    const ingredientsStr = section ? (section.getAttribute('data-detected-ingredients') || '') : '';
    const ingredients = ingredientsStr ? encodeURIComponent(ingredientsStr) : '';
    if (recipeId) openModal(recipeId, recipeName, ingredients);
  });
})();
