(() => {
  const dataUrl = '../data/econ_intel/top5_journal_network_details.json?v=6';
  const JOURNAL_CODE_ORDER = ['AER', 'QJE', 'ECMA', 'REStud', 'JPE'];
  const RANKING_MODES = [
    { key: 'papers', label: 'Papers' },
    { key: 'degree', label: 'Degree' },
    { key: 'betweenness', label: 'Betweenness' },
    { key: 'closeness', label: 'Closeness' },
    { key: 'eigenvector', label: 'Eigenvector' },
  ];

  const buttonsEl = document.getElementById('econ-journal-buttons');
  const titleEl = document.getElementById('econ-current-title');
  const subtitleEl = document.getElementById('econ-current-subtitle');
  const metricsEl = document.getElementById('econ-metrics');
  const figureControlsEl = document.getElementById('econ-figure-controls');
  const topAuthorsEl = document.getElementById('econ-top-authors');

  const paperCanvas = document.getElementById('econ-network');
  const paperFrame = document.getElementById('econ-network-frame');
  const paperTooltip = document.getElementById('econ-network-tooltip');
  const paperNote = document.getElementById('econ-figure-note');

  const connectedCanvas = document.getElementById('econ-network-connected');
  const connectedFrame = document.getElementById('econ-connected-frame');
  const connectedTooltip = document.getElementById('econ-connected-tooltip');
  const connectedNote = document.getElementById('econ-connected-note');

  if (
    !buttonsEl || !titleEl || !subtitleEl || !metricsEl || !figureControlsEl || !topAuthorsEl ||
    !paperCanvas || !paperFrame || !paperTooltip || !paperNote ||
    !connectedCanvas || !connectedFrame || !connectedTooltip || !connectedNote ||
    !window.d3
  ) {
    return;
  }

  const d3 = window.d3;
  const margin = { top: 72, right: 84, bottom: 82, left: 88 };
  const figures = {
    paper: {
      key: 'paper',
      canvas: paperCanvas,
      frame: paperFrame,
      tooltip: paperTooltip,
      noteEl: paperNote,
      ctx: paperCanvas.getContext('2d'),
      hoveredId: null,
      renderData: null,
    },
    connected: {
      key: 'connected',
      canvas: connectedCanvas,
      frame: connectedFrame,
      tooltip: connectedTooltip,
      noteEl: connectedNote,
      ctx: connectedCanvas.getContext('2d'),
      hoveredId: null,
      renderData: null,
    },
  };
  const state = {
    selectedKey: 'composite',
    rankingMode: 'degree',
    figureOrder: 'degree',
    views: new Map(),
    journalCodes: {},
  };

  paperCanvas.addEventListener('mousemove', (event) => handlePointerMove(event, 'paper'));
  paperCanvas.addEventListener('mouseleave', () => handlePointerLeave('paper'));
  connectedCanvas.addEventListener('mousemove', (event) => handlePointerMove(event, 'connected'));
  connectedCanvas.addEventListener('mouseleave', () => handlePointerLeave('connected'));

  fetch(dataUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      state.journalCodes = data?.journal_codes || {};
      buildViews(data);
      renderButtons();
      renderSelection('composite');
    })
    .catch((err) => {
      metricsEl.innerHTML = `<div class="entry-detail">Failed to load econ intelligence data: ${escapeHtml(err.message)}</div>`;
      console.error(err);
    });

  function buildViews(data) {
    state.views.set('composite', {
      key: 'composite',
      code: 'ALL',
      label: 'Composite',
      subtitle: 'Cross-journal collaboration graph across the five flagship economics journals.',
      payload: data?.composite || emptyPayload(),
    });
    JOURNAL_CODE_ORDER.forEach((code) => {
      const name = journalNameForCode(code);
      if (!name) return;
      state.views.set(name, {
        key: name,
        code,
        label: name,
        subtitle: `Full collaboration graph for ${code}.`,
        payload: data?.per_journal?.[name] || emptyPayload(),
      });
    });
  }

  function emptyPayload() {
    return {
      nodes: [],
      edges: [],
      paper_count: 0,
      author_count: 0,
      edge_count: 0,
      component_count: 0,
      largest_component_size: 0,
      betweenness_meta: { method: 'exact', sample_size: 0 },
    };
  }

  function renderButtons() {
    buttonsEl.innerHTML = '';
    Array.from(state.views.values()).forEach((view) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'econ-journal-button';
      button.dataset.viewKey = view.key;
      button.textContent = view.code;
      button.addEventListener('click', () => renderSelection(view.key));
      buttonsEl.appendChild(button);
    });
  }

  function renderSelection(viewKey) {
    const view = state.views.get(viewKey);
    if (!view) return;
    state.selectedKey = viewKey;
    figures.paper.hoveredId = null;
    figures.connected.hoveredId = null;
    hideTooltip('paper');
    hideTooltip('connected');
    Array.from(buttonsEl.children).forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.viewKey === viewKey);
    });
    titleEl.textContent = view.code;
    subtitleEl.textContent = view.subtitle;
    renderMetrics(view);
    renderFigureControls();
    figures.paper.renderData = prepareRenderData(view, 'paper');
    figures.connected.renderData = prepareRenderData(view, 'connected');
    drawFigure('paper');
    drawFigure('connected');
    renderTopAuthors(view);
  }

  function renderMetrics(view) {
    const nodes = withViewCounts(view, view.payload.nodes || []);
    const strongestEdge = describeStrongestEdge(view);
    const medianDegree = computeMedian(nodes.map((node) => Number(node.degree || 0)));
    metricsEl.innerHTML = `
      <div class="econ-metric">
        <span>Papers</span>
        <strong>${formatInteger(view.payload.paper_count || 0)}</strong>
        <small>${view.code === 'ALL' ? 'Unique papers across the five-journal set.' : `Journal articles in ${view.code}.`}</small>
      </div>
      <div class="econ-metric">
        <span>Economists Plotted</span>
        <strong>${formatInteger(view.payload.author_count || 0)}</strong>
        <small>All economists in the filtered graph are shown in both figures.</small>
      </div>
      <div class="econ-metric">
        <span>Median Collaborators</span>
        <strong>${formatInteger(medianDegree)}</strong>
        <small>Median number of distinct coauthors in the full graph.</small>
      </div>
      <div class="econ-metric">
        <span>Connected Components</span>
        <strong>${formatInteger(view.payload.component_count || 0)}</strong>
        <small>Largest component: ${formatInteger(view.payload.largest_component_size || 0)} economists.</small>
      </div>
      <div class="econ-metric">
        <span>Most Repeated Coauthorship</span>
        <strong>${strongestEdge ? `${formatInteger(strongestEdge.weight)} joint papers` : '0'}</strong>
        <small>${strongestEdge ? escapeHtml(strongestEdge.label) : 'No repeated coauthor pair in this graph.'}</small>
      </div>
    `;
  }

  function renderFigureControls() {
    figureControlsEl.innerHTML = `
      <div class="econ-side-title">Paper Figure Order</div>
      <div class="econ-side-subtitle">The top figure still uses paper counts in its geometry. Order its x-axis by the chosen metric. The connectedness-only figure below ignores paper counts in its geometry.</div>
      <div class="econ-ranking-row">
        ${RANKING_MODES.map((mode) => `
          <button type="button" class="econ-ranking-button ${mode.key === state.figureOrder ? 'is-active' : ''}" data-figure-order="${mode.key}">
            ${escapeHtml(mode.label)}
          </button>
        `).join('')}
      </div>
    `;
    figureControlsEl.querySelectorAll('[data-figure-order]').forEach((button) => {
      button.addEventListener('click', () => {
        state.figureOrder = button.dataset.figureOrder || 'degree';
        renderFigureControls();
        figures.paper.renderData = prepareRenderData(state.views.get(state.selectedKey), 'paper');
        drawFigure('paper');
      });
    });
  }

  function prepareRenderData(view, mode) {
    const figure = figures[mode];
    const width = figure.canvas.width;
    const height = figure.canvas.height;
    const nodes = withViewCounts(view, view.payload.nodes || []);
    const orderKey = mode === 'paper' ? state.figureOrder : 'eigenvector';
    const orderedNodes = sortNodes(nodes, view, orderKey);
    const yAccessor = mode === 'paper'
      ? (node) => node.selectedPaperCount
      : (node) => Number(node.degree || 0);
    const sizeAccessor = yAccessor;
    const colorAccessor = mode === 'paper'
      ? (node) => Number(node.degree || 0)
      : (node) => Math.log1p(Number(node.component_size || 1));
    const maxY = d3.max(orderedNodes, yAccessor) || 1;
    const maxColor = d3.max(orderedNodes, colorAccessor) || 1;
    const xSpan = width - margin.left - margin.right;
    const yScale = d3.scaleSqrt()
      .domain([0, maxY])
      .range([height - margin.bottom, margin.top]);
    const radiusScale = d3.scaleSqrt()
      .domain([0, maxY])
      .range(mode === 'paper' ? [1.1, 8.2] : [0.8, 5.6]);
    const colorScale = d3.scaleLinear()
      .domain([0, maxColor])
      .range(['#d7e2ee', '#7a231a']);

    orderedNodes.forEach((node, index) => {
      node.rankIndex = index;
      node.plotX = margin.left + ((orderedNodes.length <= 1 ? 0 : index / (orderedNodes.length - 1)) * xSpan);
      node.plotY = yScale(yAccessor(node));
      node.plotR = radiusScale(sizeAccessor(node));
      node.plotColor = colorScale(colorAccessor(node));
    });

    const nodeById = new Map(orderedNodes.map((node) => [node.author_id, node]));
    const links = (view.payload.edges || [])
      .filter((edge) => nodeById.has(edge.authors?.[0]) && nodeById.has(edge.authors?.[1]))
      .map((edge) => ({
        source: nodeById.get(edge.authors[0]),
        target: nodeById.get(edge.authors[1]),
        weight: Number(edge.weight || 0),
      }));

    return {
      view,
      mode,
      nodes: orderedNodes,
      links,
      quadtree: d3.quadtree().x((node) => node.plotX).y((node) => node.plotY).addAll(orderedNodes),
      yScale,
      radiusScale,
      colorScale,
      maxColor,
      maxY,
      orderKey,
      yAccessor,
      colorAccessor,
    };
  }

  function drawFigure(mode) {
    const figure = figures[mode];
    const data = figure.renderData;
    const context = figure.ctx;
    const width = figure.canvas.width;
    const height = figure.canvas.height;
    context.clearRect(0, 0, width, height);

    if (!data || !data.nodes.length) {
      context.save();
      context.fillStyle = '#8a8a8a';
      context.font = '16px Georgia, serif';
      context.textAlign = 'center';
      context.fillText('No network data available', width / 2, height / 2);
      context.restore();
      figure.noteEl.textContent = 'This view has no usable coauthorship graph in the current artifact.';
      return;
    }

    const axisConfig = mode === 'paper'
      ? {
          yLabel: 'Papers in selected view',
          xLabel: `${rankingLabel(data.orderKey)} rank in full graph`,
          extremes: rankingExtremes(data.orderKey),
        }
      : {
          yLabel: 'Distinct collaborators in full graph',
          xLabel: 'Eigenvector centrality rank in full graph',
          extremes: { left: 'More central', right: 'Less central' },
        };

    drawAxes(context, data.yScale, axisConfig, width, height);
    drawLinks(context, data.links);
    drawNodes(context, data.nodes);
    drawLabels(context, labelNodesForMode(data.nodes, mode));
    if (figure.hoveredId) {
      const hoveredNode = data.nodes.find((node) => node.author_id === figure.hoveredId);
      if (hoveredNode) drawHoveredNode(context, hoveredNode);
    }
    drawLegend(context, data, mode, width);

    const betweennessNote = data.view.payload.betweenness_meta?.method === 'approx'
      ? ` Betweenness is approximated on the full graph with ${formatInteger(data.view.payload.betweenness_meta.sample_size || 0)} source nodes.`
      : ' Betweenness is exact on the full graph.';
    if (mode === 'paper') {
      figure.noteEl.textContent =
        `${data.view.code === 'ALL' ? 'Composite graph' : `${data.view.code} graph`} plots every economist in the filtered data: ` +
        `${formatInteger(data.view.payload.author_count || data.nodes.length)} nodes and ${formatInteger(data.view.payload.edge_count || data.links.length)} coauthorship edges. ` +
        `Horizontal order follows ${rankingLabel(data.orderKey).toLowerCase()} rank in the full graph. ` +
        `Node height and size show papers in the selected view. Darker nodes have more distinct collaborators.${betweennessNote}`;
    } else {
      figure.noteEl.textContent =
        `${data.view.code === 'ALL' ? 'Composite connectedness graph' : `${data.view.code} connectedness graph`} uses only coauthorship structure in its geometry. ` +
        `All ${formatInteger(data.view.payload.author_count || data.nodes.length)} economists are plotted. ` +
        `Horizontal order follows eigenvector centrality rank in the full graph. Vertical position and node size show distinct collaborators. ` +
        `Color shows the size of the author’s connected component.${betweennessNote}`;
    }
  }

  function drawAxes(context, yScale, axisConfig, width, height) {
    context.save();
    context.strokeStyle = '#d6c9bf';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(margin.left, height - margin.bottom);
    context.lineTo(width - margin.right, height - margin.bottom);
    context.stroke();
    context.beginPath();
    context.moveTo(margin.left, margin.top - 8);
    context.lineTo(margin.left, height - margin.bottom);
    context.stroke();

    context.fillStyle = '#7a6a61';
    context.font = '11px Georgia, serif';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    tickValues(yScale.domain()[1]).forEach((value) => {
      const y = yScale(value);
      context.beginPath();
      context.moveTo(margin.left - 4, y);
      context.lineTo(margin.left, y);
      context.stroke();
      context.fillText(formatCompact(value), margin.left - 8, y);
    });

    context.save();
    context.translate(margin.left - 56, height / 2);
    context.rotate(-Math.PI / 2);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#6f6058';
    context.font = '600 12px Georgia, serif';
    context.fillText(axisConfig.yLabel, 0, 0);
    context.restore();

    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#6f6058';
    context.font = '600 12px Georgia, serif';
    context.fillText(axisConfig.xLabel, width / 2, height - 20);

    context.textAlign = 'left';
    context.font = '11px Georgia, serif';
    context.fillStyle = '#8a776d';
    context.fillText(axisConfig.extremes.left, margin.left + 4, height - 40);
    context.textAlign = 'right';
    context.fillText(axisConfig.extremes.right, width - margin.right - 4, height - 40);
    context.restore();
  }

  function drawLinks(context, links) {
    context.save();
    context.lineCap = 'round';
    for (const link of links) {
      const opacity = Math.min(0.16, 0.012 + (link.weight * 0.014));
      context.strokeStyle = `rgba(130, 148, 166, ${opacity})`;
      context.lineWidth = Math.min(1.8, 0.22 + (link.weight * 0.12));
      context.beginPath();
      context.moveTo(link.source.plotX, link.source.plotY);
      context.lineTo(link.target.plotX, link.target.plotY);
      context.stroke();
    }
    context.restore();
  }

  function drawNodes(context, nodes) {
    context.save();
    for (const node of nodes) {
      context.beginPath();
      context.fillStyle = withAlpha(node.plotColor, 0.72);
      context.arc(node.plotX, node.plotY, node.plotR, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawLabels(context, nodes) {
    context.save();
    context.font = '600 11px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    for (const node of nodes) {
      const y = clamp(node.plotY - node.plotR - 7, margin.top - 4, 620 - margin.bottom - 8);
      context.strokeStyle = 'rgba(255,255,255,0.94)';
      context.lineWidth = 4;
      context.strokeText(node.author_name, node.plotX, y);
      context.fillStyle = '#5a4b45';
      context.fillText(node.author_name, node.plotX, y);
    }
    context.restore();
  }

  function drawHoveredNode(context, node) {
    context.save();
    context.beginPath();
    context.strokeStyle = '#111';
    context.lineWidth = 1.4;
    context.arc(node.plotX, node.plotY, node.plotR + 2.2, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawLegend(context, data, mode, width) {
    const legendX = width - margin.right - 150;
    const legendY = margin.top - 18;
    context.save();
    context.fillStyle = '#5e4f47';
    context.font = '700 12px Georgia, serif';
    context.textAlign = 'left';
    context.fillText(mode === 'paper' ? 'Node size = papers' : 'Node size = collaborators', legendX, legendY);

    const values = legendValues(data.nodes.map((node) => mode === 'paper' ? node.selectedPaperCount : Number(node.degree || 0)));
    values.forEach((value, index) => {
      const radius = data.radiusScale(value);
      const y = legendY + 24 + (index * 26);
      context.beginPath();
      context.fillStyle = '#e5edf5';
      context.strokeStyle = '#b8c6d4';
      context.arc(legendX + radius, y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = '#6b5b52';
      context.font = '11px Georgia, serif';
      context.fillText(formatInteger(value), legendX + 42, y + 4);
    });

    const colorY = legendY + 106;
    context.fillStyle = '#5e4f47';
    context.font = '700 12px Georgia, serif';
    context.textAlign = 'left';
    context.fillText(mode === 'paper' ? 'Color = collaborators' : 'Color = component size', legendX, colorY);
    [0, data.maxColor / 2, data.maxColor].forEach((value, index) => {
      context.fillStyle = data.colorScale(value);
      roundRect(context, legendX + (index * 34), colorY + 12, 26, 10, 3);
      context.fill();
    });
    context.fillStyle = '#6b5b52';
    context.font = '11px Georgia, serif';
    context.fillText(mode === 'paper' ? 'Fewer' : 'Smaller', legendX, colorY + 34);
    context.textAlign = 'right';
    context.fillText(mode === 'paper' ? 'More' : 'Larger', legendX + 68, colorY + 34);
    context.restore();
  }

  function renderTopAuthors(view) {
    const nodes = withViewCounts(view, view.payload.nodes || []);
    const sorted = sortNodes(nodes, view, state.rankingMode).slice(0, 18);
    topAuthorsEl.innerHTML = `
      <div class="econ-side-title">Economists In Full Graph</div>
      <div class="econ-side-subtitle">Rank the full-graph economists by papers or by a centrality computed on the full graph.</div>
      <div class="econ-ranking-row">
        ${RANKING_MODES.map((mode) => `
          <button type="button" class="econ-ranking-button ${mode.key === state.rankingMode ? 'is-active' : ''}" data-ranking-mode="${mode.key}">
            ${escapeHtml(mode.label)}
          </button>
        `).join('')}
      </div>
      <div class="econ-author-list">
        ${sorted.map((node, index) => `
          <div class="econ-author-row">
            <div class="econ-author-rank">${index + 1}</div>
            <div class="econ-author-main">
              <div class="econ-author-name">${escapeHtml(node.author_name)}</div>
              <div class="econ-author-meta">${escapeHtml(formatJournalCounts(node.journal_counts))} · ${escapeHtml(node.affiliation)}</div>
            </div>
            <div class="econ-author-stats">
              <span>${escapeHtml(primaryRankingText(node, state.rankingMode))}</span>
              <span>${escapeHtml(secondaryRankingText(node, state.rankingMode))}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    topAuthorsEl.querySelectorAll('[data-ranking-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        state.rankingMode = button.dataset.rankingMode || 'degree';
        renderTopAuthors(view);
      });
    });
  }

  function handlePointerMove(event, mode) {
    const figure = figures[mode];
    const data = figure.renderData;
    if (!data || !data.quadtree) return;
    const point = pointerPosition(event, figure.canvas);
    const nearest = data.quadtree.find(point.x, point.y, 16);
    if (!nearest || distance(point.x, point.y, nearest.plotX, nearest.plotY) > Math.max(6, nearest.plotR + 3)) {
      if (figure.hoveredId !== null) {
        figure.hoveredId = null;
        drawFigure(mode);
      }
      hideTooltip(mode);
      return;
    }
    showTooltip(mode, event, nearest);
    if (figure.hoveredId !== nearest.author_id) {
      figure.hoveredId = nearest.author_id;
      drawFigure(mode);
    }
  }

  function handlePointerLeave(mode) {
    const figure = figures[mode];
    if (figure.hoveredId !== null) {
      figure.hoveredId = null;
      drawFigure(mode);
    }
    hideTooltip(mode);
  }

  function pointerPosition(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function showTooltip(mode, event, node) {
    const tooltip = figures[mode].tooltip;
    tooltip.hidden = false;
    tooltip.innerHTML = mode === 'paper'
      ? `
        <div class="econ-tooltip-name">${escapeHtml(node.author_name)}</div>
        <div class="econ-tooltip-affiliation">${escapeHtml(node.affiliation)}</div>
        <div class="econ-tooltip-grid">
          <div><span>Papers here</span><br><strong>${formatInteger(node.selectedPaperCount)}</strong></div>
          <div><span>Total top-5 papers</span><br><strong>${formatInteger(node.paper_count)}</strong></div>
          <div><span>Collaborators</span><br><strong>${formatInteger(node.degree)}</strong></div>
          <div><span>Degree centrality</span><br><strong>${formatDecimal(node.degree_centrality)}</strong></div>
          <div><span>Betweenness</span><br><strong>${formatDecimal(node.betweenness)}</strong></div>
          <div><span>Closeness</span><br><strong>${formatDecimal(node.closeness)}</strong></div>
          <div><span>Eigenvector</span><br><strong>${formatDecimal(node.eigenvector)}</strong></div>
          <div><span>Component size</span><br><strong>${formatInteger(node.component_size || 1)}</strong></div>
        </div>
        <div class="econ-tooltip-journals">${escapeHtml(formatJournalCounts(node.journal_counts))}</div>
      `
      : `
        <div class="econ-tooltip-name">${escapeHtml(node.author_name)}</div>
        <div class="econ-tooltip-affiliation">${escapeHtml(node.affiliation)}</div>
        <div class="econ-tooltip-grid">
          <div><span>Collaborators</span><br><strong>${formatInteger(node.degree)}</strong></div>
          <div><span>Component size</span><br><strong>${formatInteger(node.component_size || 1)}</strong></div>
          <div><span>Degree centrality</span><br><strong>${formatDecimal(node.degree_centrality)}</strong></div>
          <div><span>Betweenness</span><br><strong>${formatDecimal(node.betweenness)}</strong></div>
          <div><span>Closeness</span><br><strong>${formatDecimal(node.closeness)}</strong></div>
          <div><span>Eigenvector</span><br><strong>${formatDecimal(node.eigenvector)}</strong></div>
        </div>
      `;
    positionTooltip(mode, event);
  }

  function positionTooltip(mode, event) {
    const figure = figures[mode];
    const frameBox = figure.frame.getBoundingClientRect();
    const tooltipBox = figure.tooltip.getBoundingClientRect();
    let left = event.clientX - frameBox.left + 14;
    let top = event.clientY - frameBox.top + 14;
    if (left + tooltipBox.width > frameBox.width - 8) {
      left = Math.max(8, frameBox.width - tooltipBox.width - 10);
    }
    if (top + tooltipBox.height > frameBox.height - 8) {
      top = Math.max(8, frameBox.height - tooltipBox.height - 10);
    }
    figure.tooltip.style.left = `${left}px`;
    figure.tooltip.style.top = `${top}px`;
  }

  function hideTooltip(mode) {
    figures[mode].tooltip.hidden = true;
  }

  function describeStrongestEdge(view) {
    const strongest = (view.payload.edges || [])[0];
    if (!strongest) return null;
    const nodeById = new Map((view.payload.nodes || []).map((node) => [node.author_id, node.author_name]));
    return {
      weight: Number(strongest.weight || 0),
      label: `${nodeById.get(strongest.authors[0]) || strongest.authors[0]} and ${nodeById.get(strongest.authors[1]) || strongest.authors[1]}`,
    };
  }

  function withViewCounts(view, nodes) {
    return nodes.map((node) => ({
      ...node,
      selectedPaperCount: getSelectedPaperCount(view, node),
    }));
  }

  function getSelectedPaperCount(view, node) {
    if (view.key === 'composite') return Number(node.paper_count || 0);
    return Number(node.journal_counts?.[view.key] || 0);
  }

  function sortNodes(nodes, view, rankingMode) {
    return [...nodes].sort((a, b) => {
      const metricB = getRankingValue(b, rankingMode);
      const metricA = getRankingValue(a, rankingMode);
      if (metricB !== metricA) return metricB - metricA;
      if (b.selectedPaperCount !== a.selectedPaperCount) return b.selectedPaperCount - a.selectedPaperCount;
      if (Number(b.degree || 0) !== Number(a.degree || 0)) return Number(b.degree || 0) - Number(a.degree || 0);
      return String(a.author_name || '').localeCompare(String(b.author_name || ''));
    });
  }

  function getRankingValue(node, rankingMode) {
    switch (rankingMode) {
      case 'papers':
        return Number(node.selectedPaperCount || 0);
      case 'degree':
        return Number(node.degree || 0);
      case 'betweenness':
        return Number(node.betweenness || 0);
      case 'closeness':
        return Number(node.closeness || 0);
      case 'eigenvector':
        return Number(node.eigenvector || 0);
      default:
        return Number(node.degree || 0);
    }
  }

  function labelNodesForMode(nodes, mode) {
    if (mode === 'paper') return sortNodes(nodes, null, 'eigenvector').slice(0, 12);
    return sortNodes(nodes, null, 'degree').slice(0, 12);
  }

  function primaryRankingText(node, rankingMode) {
    switch (rankingMode) {
      case 'papers':
        return `${formatInteger(node.selectedPaperCount)} papers`;
      case 'degree':
        return `${formatInteger(node.degree)} collaborators`;
      case 'betweenness':
        return `bet ${formatDecimal(node.betweenness)}`;
      case 'closeness':
        return `close ${formatDecimal(node.closeness)}`;
      case 'eigenvector':
        return `eig ${formatDecimal(node.eigenvector)}`;
      default:
        return `${formatInteger(node.degree)} collaborators`;
    }
  }

  function secondaryRankingText(node, rankingMode) {
    if (rankingMode === 'papers') return `${formatInteger(node.degree)} collaborators`;
    return `${formatInteger(node.selectedPaperCount)} papers`;
  }

  function rankingLabel(key) {
    return RANKING_MODES.find((mode) => mode.key === key)?.label || 'Degree';
  }

  function rankingExtremes(key) {
    if (key === 'papers') return { left: 'More papers', right: 'Fewer papers' };
    return { left: 'Higher rank', right: 'Lower rank' };
  }

  function formatJournalCounts(counts) {
    return JOURNAL_CODE_ORDER
      .map((code) => {
        const name = journalNameForCode(code);
        return `${code} ${formatInteger(counts?.[name] || 0)}`;
      })
      .join(' · ');
  }

  function journalNameForCode(code) {
    return Object.keys(state.journalCodes).find((name) => state.journalCodes[name] === code) || '';
  }

  function tickValues(maxValue) {
    if (!maxValue || maxValue <= 0) return [0, 1];
    const values = [0, maxValue / 4, maxValue / 2, (3 * maxValue) / 4, maxValue];
    return [...new Set(values.map((value) => Math.round(value)).filter((value) => value >= 0))];
  }

  function legendValues(values) {
    const positive = values.filter((value) => Number(value) > 0).sort((a, b) => a - b);
    if (!positive.length) return [0];
    return [...new Set([
      positive[0],
      positive[Math.floor((positive.length - 1) / 2)],
      positive[positive.length - 1],
    ])];
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function withAlpha(color, alpha) {
    const c = d3.color(color);
    if (!c) return color;
    c.opacity = alpha;
    return `${c}`;
  }

  function distance(x1, y1, x2, y2) {
    return Math.sqrt(((x1 - x2) ** 2) + ((y1 - y2) ** 2));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value || 0)));
  }

  function computeMedian(values) {
    const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!nums.length) return 0;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  function formatInteger(value) {
    return Math.round(Number(value || 0)).toLocaleString();
  }

  function formatCompact(value) {
    return d3.format('~s')(Number(value || 0));
  }

  function formatDecimal(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0.000';
    return numeric.toFixed(3);
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
})();
