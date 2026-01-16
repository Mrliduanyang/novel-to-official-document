// 保存原始内容
let originalContent = null;
let isConverted = false;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'convert') {
    convertToOfficial(request.config);
    sendResponse({ success: true });
  } else if (request.action === 'restore') {
    restoreOriginal();
    sendResponse({ success: true });
  }
  return true;
});

// 提取小说内容的函数
function extractNovelContent() {
  let title = '';
  let content = '';
  let chapterTitle = '';
  
  // 常见小说网站的选择器
  const selectors = {
    // 起点中文网
    qidian: {
      title: '.book-info h1, .book-name',
      chapter: '.j_chapterName, .chapter-title, h3.j_chapterName',
      content: '.read-content, #content, .content-wrap'
    },
    // 纵横中文网
    zongheng: {
      title: '.book-name, .bookname',
      chapter: '.title, .chapter_name',
      content: '.content, #chapterContent'
    },
    // 17K小说网
    '17k': {
      title: '.book-name, h1',
      chapter: '.h2, .chapter_title',
      content: '#content, .p'
    },
    // 通用选择器
    common: {
      title: 'h1, .title, .book-title, .novel-title',
      chapter: 'h2, h3, .chapter-title, .chapter-name',
      content: '.content, #content, .chapter-content, .novel-content, article'
    }
  };
  
  // 尝试不同的选择器
  for (let site in selectors) {
    const sel = selectors[site];
    
    // 获取标题
    if (!title) {
      const titleEl = document.querySelector(sel.title);
      if (titleEl) title = titleEl.textContent.trim();
    }
    
    // 获取章节名
    if (!chapterTitle) {
      const chapterEl = document.querySelector(sel.chapter);
      if (chapterEl) chapterTitle = chapterEl.textContent.trim();
    }
    
    // 获取内容
    if (!content) {
      const contentEl = document.querySelector(sel.content);
      if (contentEl) {
        // 提取段落
        const paragraphs = contentEl.querySelectorAll('p');
        if (paragraphs.length > 0) {
          content = Array.from(paragraphs)
            .map(p => p.textContent.trim())
            .filter(text => text.length > 0)
            .join('\n\n');
        } else {
          content = contentEl.textContent.trim();
        }
      }
    }
    
    if (title && content) break;
  }
  
  return {
    title: title || document.title,
    chapterTitle: chapterTitle,
    content: content || '未能提取到内容'
  };
}

// 动态计算内容高度并分页
function splitContentIntoPages(content, chapterTitle = '章节标题') {
  const paragraphs = content.split('\n\n').filter(p => p.trim());
  
  // 创建不可见的测量容器
  const tempContainer = document.createElement('div');
  tempContainer.style.cssText = `
    position: absolute;
    visibility: hidden;
    width: 156mm;
    font-size: 16pt;
    line-height: 2;
    font-family: "FangSong_GB2312", "仿宋_GB2312", "FangSong", "仿宋", serif;
  `;
  document.body.appendChild(tempContainer);
  
  // 定义页面高度限制（单位：mm）
  const PAGE_HEIGHT_MM = 225;      // A4总可用高度 = 297 - 37(上) - 35(下)
  const LAST_PAGE_HEIGHT_MM = 195; // 最后页 = 225 - 30(落款)
  const MM_TO_PX = 3.7795275591;   // 1mm = 3.78px (96dpi)
  
  // 动态测量第一页的红头、文号、标题高度
  const headerContainer = document.createElement('div');
  headerContainer.style.cssText = 'position: absolute; visibility: hidden; width: 156mm;';
  document.body.appendChild(headerContainer);
  
  // 红头部分
  const header = document.createElement('div');
  header.style.cssText = 'text-align: center; margin-bottom: 20mm;';
  header.innerHTML = `
    <div style="font-size: 22pt; font-weight: bold; color: #c8161d; letter-spacing: 2px; margin-bottom: 3mm; font-family: SimHei, 黑体, sans-serif;">XX省网络文学管理委员会</div>
    <div style="width: 100%; height: 0.5mm; background-color: #c8161d; margin: 5mm 0;"></div>
  `;
  headerContainer.appendChild(header);
  
  // 文号
  const docNumber = document.createElement('div');
  docNumber.style.cssText = 'text-align: center; font-size: 16pt; margin-bottom: 8mm; font-family: "FangSong_GB2312", "仿宋_GB2312", "FangSong", "仿宋", serif;';
  docNumber.textContent = 'X网文〔2026〕1号';
  headerContainer.appendChild(docNumber);
  
  // 标题
  const title = document.createElement('div');
  title.style.cssText = 'text-align: center; font-size: 22pt; font-weight: bold; margin-bottom: 10mm; line-height: 1.5; font-family: SimHei, 黑体, sans-serif;';
  title.textContent = chapterTitle;
  headerContainer.appendChild(title);
  
  const headerHeight = headerContainer.offsetHeight;
  document.body.removeChild(headerContainer);
  
  const FIRST_PAGE_HEIGHT_MM = (PAGE_HEIGHT_MM * MM_TO_PX - headerHeight) / MM_TO_PX
  
  // 预先测量所有段落的高度（包括margin）
  const paragraphHeights = paragraphs.map(para => {
    const p = document.createElement('p');
    p.style.cssText = 'margin-bottom: 1em; text-indent: 2em; font-size: 16pt; line-height: 2;';
    p.textContent = para;
    tempContainer.appendChild(p);
    
    // offsetHeight不包含margin，需要手动计算
    const height = p.offsetHeight;
    const computedStyle = window.getComputedStyle(p);
    const marginBottom = parseFloat(computedStyle.marginBottom);
    
    tempContainer.removeChild(p);
    
    // 返回内容高度和下边距，分开存储
    return {
      contentHeight: height,
      marginBottom: marginBottom,
      totalHeight: height + marginBottom
    };
  });
  
  // 清理测量容器
  document.body.removeChild(tempContainer);
  
  // 开始分页
  const pages = [];
  let currentPage = [];
  let currentPageHeight = 0;
  let pageIndex = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraInfo = paragraphHeights[i];
    
    // 计算当前页面的高度限制
    let maxHeight;
    
    if (pageIndex === 0) {
      // 第一页
      maxHeight = FIRST_PAGE_HEIGHT_MM * MM_TO_PX;
    } else {
      // 后续页（不提前限制，统一使用普通页高度）
      maxHeight = PAGE_HEIGHT_MM * MM_TO_PX;
    }
    
    // 判断是否需要换页
    if (currentPage.length > 0) {
      // 尝试1: 加上完整高度（内容+下边距）
      const heightWithMargin = currentPageHeight + paraInfo.contentHeight + paraInfo.marginBottom;
      
      if (heightWithMargin <= maxHeight) {
        // 可以放入，包含下边距
        currentPage.push({ text: para, index: i, hasMargin: true });
        currentPageHeight = heightWithMargin;
      } else {
        // 尝试2: 只加内容高度（不含下边距），作为页面最后一段
        const heightWithoutMargin = currentPageHeight + paraInfo.contentHeight;
        
        if (heightWithoutMargin <= maxHeight) {
          // 可以放入，但作为最后一段，不含下边距
          currentPage.push({ text: para, index: i, hasMargin: false });
          currentPageHeight = heightWithoutMargin;
        } else {
          // 完全放不下，需要换页
          pages.push({
            paragraphs: currentPage.map(p => p.text),
            height: currentPageHeight
          });
          
          // 开始新页
          currentPage = [{ text: para, index: i, hasMargin: true }];
          currentPageHeight = paraInfo.contentHeight + paraInfo.marginBottom;
          pageIndex++;
        }
      }
    } else {
      // 第一个段落，直接添加
      currentPage.push({ text: para, index: i, hasMargin: true });
      currentPageHeight = paraInfo.contentHeight + paraInfo.marginBottom;
    }
  }
  
  // 添加最后一页
  if (currentPage.length > 0) {
    pages.push({
      paragraphs: currentPage.map(p => p.text),
      height: currentPageHeight
    });
  }
  
  // 检查最后一页的高度是否超过限制
  if (pages.length > 0) {
    const lastPageMaxHeight = LAST_PAGE_HEIGHT_MM * MM_TO_PX;
    const lastPage = pages[pages.length - 1];
    
    if (lastPage.height > lastPageMaxHeight) {
      // 获取最后一页的段落
      const lastPageParagraphs = lastPage.paragraphs;
      const lastPageStartIndex = paragraphs.length - lastPageParagraphs.length;
      
      // 移除最后一页，重新分配
      pages.pop();
      
      // 重新分配最后一页的段落
      let newLastPage = [];
      let newLastPageHeight = 0;
      
      for (let i = 0; i < lastPageParagraphs.length; i++) {
        const para = lastPageParagraphs[i];
        const paraInfo = paragraphHeights[lastPageStartIndex + i];
        
        // 尝试添加到新的最后一页
        const heightWithMargin = newLastPageHeight + paraInfo.contentHeight + paraInfo.marginBottom;
        const heightWithoutMargin = newLastPageHeight + paraInfo.contentHeight;
        
        if (heightWithMargin <= lastPageMaxHeight) {
          newLastPage.push(para);
          newLastPageHeight = heightWithMargin;
        } else if (heightWithoutMargin <= lastPageMaxHeight) {
          newLastPage.push(para);
          newLastPageHeight = heightWithoutMargin;
        } else {
          // 当前段落放不下，需要新开一页
          // 将已有段落作为倒数第二页
          if (newLastPage.length > 0) {
            pages.push({
              paragraphs: newLastPage,
              height: newLastPageHeight
            });
          }
          
          // 开始新的最后一页
          newLastPage = [para];
          newLastPageHeight = paraInfo.contentHeight + paraInfo.marginBottom;
        }
      }
      
      // 添加最终的最后一页
      if (newLastPage.length > 0) {
        pages.push({
          paragraphs: newLastPage,
          height: newLastPageHeight
        });
      }
    }
  }
  
  // 返回段落数组格式
  return pages.length > 0 ? pages.map(page => page.paragraphs) : [[]];
}

// 转换为公文格式
function convertToOfficial(config) {
  if (isConverted) {
    alert('已经是公文格式了');
    return;
  }
  
  // 保存原始内容
  originalContent = document.body.innerHTML;
  
  // 提取小说内容
  const novel = extractNovelContent();
  
  // 分页（传入章节标题用于动态计算第一页高度）
  const pages = splitContentIntoPages(novel.content, novel.chapterTitle || novel.title);
  
  // 生成公文HTML
  const officialHTML = generateOfficialHTML(novel, pages, config);
  
  // 替换页面内容
  document.body.innerHTML = officialHTML;
  
  // 添加打印按钮事件
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }
  
  isConverted = true;
}

// 生成公文HTML
function generateOfficialHTML(novel, pages, config) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  
  let html = `
    <button id="printBtn" style="position: fixed; top: 20px; right: 20px; padding: 10px 20px; background-color: #c8161d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; z-index: 10000;">打印文档</button>
    <div class="document-container official-document">
  `;
  
  // 第一页（包含红头、标题等）
  html += `
    <div class="page">
      <div class="header">
        <div class="header-title">${config.orgName}</div>
        <div class="header-line"></div>
      </div>
      
      <div class="document-number">${config.docNumber}</div>
      
      <div class="title">
        ${novel.chapterTitle || novel.title}
      </div>
      
      <div class="content">
  `;
  
  // 添加第一页的内容
  if (pages.length > 0) {
    for (let para of pages[0]) {
      html += `<p>${para}</p>`;
    }
  }
  
  html += `
        <div class="page-number">—1—</div>
      </div>
    </div>
  `;
  
  // 后续页面
  for (let i = 1; i < pages.length; i++) {
    const isLastPage = i === pages.length - 1;
    
    html += `
      <div class="page">
        <div class="content">
    `;
    
    for (let para of pages[i]) {
      html += `<p>${para}</p>`;
    }
    
    // 最后一页添加落款
    if (isLastPage) {
      html += `
        </div>
        <div class="signature">
          <div class="signature-unit">${config.orgName}</div>
          <div class="signature-date">${dateStr}</div>
        </div>
        <div class="page-number">—${i + 1}—</div>
      </div>
      `;
    } else {
      html += `
          <div class="page-number">—${i + 1}—</div>
        </div>
      </div>
      `;
    }
  }
  
  html += `</div>`;
  
  return html;
}

// 恢复原始格式
function restoreOriginal() {
  if (originalContent) {
    document.body.innerHTML = originalContent;
    isConverted = false;
    originalContent = null;
  }
}
