// Ponto de entrada MV3 reservado para o futuro bridge Native Messaging.
// Intencionalmente não abre conexões, não faz polling e não mantém o worker vivo.
chrome.runtime.onInstalled.addListener(() => {
  if (import.meta.env.DEV) {
    console.info("Auri Extension instalada.");
  }
});
