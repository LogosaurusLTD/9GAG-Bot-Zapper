document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveButton').addEventListener('click', saveOptions);

function saveOptions() {
  const selectedLevel = document.querySelector('input[name="blockingLevel"]:checked').value;
  chrome.storage.sync.set({
    blockingLevel: selectedLevel
  }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => {
      status.textContent = '';
    }, 750);
  });
}

function restoreOptions() {
  chrome.storage.sync.get({
    blockingLevel: 'medium'
  }, (items) => {
    document.querySelector(`input[value="${items.blockingLevel}"]`).checked = true;
  });
}