// 保存配置到storage
function saveConfig() {
  const config = {
    orgName: document.getElementById('orgName').value,
    docNumber: document.getElementById('docNumber').value
  };
  chrome.storage.sync.set(config);
}

// 加载配置
chrome.storage.sync.get(['orgName', 'docNumber'], (result) => {
  if (result.orgName) {
    document.getElementById('orgName').value = result.orgName;
  }
  if (result.docNumber) {
    document.getElementById('docNumber').value = result.docNumber;
  }
});

// 转换按钮
document.getElementById('convertBtn').addEventListener('click', async () => {
  saveConfig();
  
  const config = {
    orgName: document.getElementById('orgName').value,
    docNumber: document.getElementById('docNumber').value
  };
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { 
    action: 'convert',
    config: config
  }, (response) => {
    if (response && response.success) {
      document.getElementById('status').textContent = '✅ 转换成功';
      setTimeout(() => {
        document.getElementById('status').textContent = '';
      }, 2000);
    } else {
      document.getElementById('status').textContent = '❌ 转换失败，请确认在小说页面';
    }
  });
});

// 恢复按钮
document.getElementById('restoreBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: 'restore' }, (response) => {
    if (response && response.success) {
      document.getElementById('status').textContent = '✅ 已恢复原始格式';
      setTimeout(() => {
        document.getElementById('status').textContent = '';
      }, 2000);
    }
  });
});
