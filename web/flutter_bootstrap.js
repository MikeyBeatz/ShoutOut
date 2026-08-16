{{flutter_js}}
{{flutter_build_config}}

(async () => {
  try {
    await _flutter.loader.load();
  } catch (error) {
    console.error('ShoutOut failed to start.', error);
    document.body.innerHTML = `
      <main style="font: 16px system-ui; max-width: 32rem; margin: 20vh auto; padding: 1.5rem; text-align: center; color: #1f2933">
        <h1 style="font-size: 1.4rem">ShoutOut se nepodařilo načíst</h1>
        <p>Zkontroluj připojení a zkus aplikaci načíst znovu.</p>
        <button onclick="location.reload()" style="border: 0; border-radius: 999px; padding: .8rem 1.2rem; background: #0a6371; color: white; font: inherit">
          Načíst znovu
        </button>
      </main>`;
  }
})();
