import { generateId, debounce } from './modules/utils.js';
import { getElement, createDiv } from './modules/domHelpers.js';

class XMLTreeVisualizer {
  constructor() {
    // Safely get DOM elements with checks
    this.xmlInput = getElement("xmlInput", true);
    this.treeContainer = getElement("treeContainer", true);
    this.statusMessage = getElement("statusMessage");

    // Create a missing statusMessage element if needed and treeContainer exists
    if (!this.statusMessage && this.treeContainer) {
      this.statusMessage = createDiv("statusMessage", "status-message", this.treeContainer);
      console.log("Created missing statusMessage element during initialization");
    }

    // Validate critical DOM elements exist
    if (!this.xmlInput || !this.treeContainer) {
      console.error("Critical DOM elements not found. Make sure the page is fully loaded and elements with IDs 'xmlInput' and 'treeContainer' exist.");
      return;
    }

    this.currentZoom = 1;
    this.minZoom = 0.1;  // Solo un límite mínimo para evitar zoom negativo
    this.maxZoom = 10;   // Un límite muy alto para zoom "infinito"
    this.zoomStep = 0.1;

    this.nodeWidth = 120;
    this.nodeHeight = 40;
    this.levelHeight = 80;
    this.nodeSpacing = 20;

    // Posición para drag & pan
    this.panOffsetX = 0;
    this.panOffsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.treeData = null;
    this.collapsedNodes = new Set();
    
    // Flag para indicar si es la primera visualización
    this.isFirstRender = true;
    
    // Performance optimizations: no limit on rendered nodes initially
    this.visibleNodeLimit = Infinity;
    this.renderDebounceTime = 50; // Debounce time for rendering operations
    this.renderTimeout = null;    // For debouncing render operations
    this.renderedNodes = new Set(); // Track which nodes have been rendered
    this.nodeCache = new Map();   // Cache for node elements
    
    this.initializeEventListeners();
    this.loadDefaultXML();
  }

  initializeEventListeners() {
    // Helper function to safely add event listener
    const addSafeEventListener = (elementId, event, handler) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener(event, handler);
      } else {
        console.warn(`Cannot add event listener: Element with ID "${elementId}" not found`);
      }
    };
    
    // Use the helper for all buttons
    addSafeEventListener("visualizeBtn", "click", () => this.visualizeXML());
    addSafeEventListener("clearBtn", "click", () => this.clearInput());
    addSafeEventListener("expandAllBtn", "click", () => this.expandAll());
    addSafeEventListener("collapseAllBtn", "click", () => this.collapseAll());

    addSafeEventListener("zoomInBtn", "click", () => this.zoomIn());
    addSafeEventListener("zoomOutBtn", "click", () => this.zoomOut());
    addSafeEventListener("resetZoomBtn", "click", () => this.resetZoom());
      
    addSafeEventListener("fullscreenBtn", "click", () => this.toggleFullscreen());
    addSafeEventListener("downloadBtn", "click", () => this.downloadDiagram());

    // Implementar arrastre (drag & pan)
    if (this.treeContainer) {
      this.treeContainer.addEventListener("mousedown", (e) => this.startDrag(e));
      this.treeContainer.addEventListener("mousemove", (e) => this.drag(e));
      this.treeContainer.addEventListener("mouseup", () => this.endDrag());
      this.treeContainer.addEventListener("mouseleave", () => this.endDrag());
      
      // Soporte para rueda del ratón para zoom
      this.treeContainer.addEventListener("wheel", (e) => {
        e.preventDefault();
        
        // Capturar la posición del cursor para hacer zoom centrado en ese punto
        const rect = this.treeContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Guardar zoom actual
        const oldZoom = this.currentZoom;
        let newZoom;
        
        // Calcular nuevo zoom
        if (e.deltaY < 0) {
          // Zoom in - mismo cálculo que en zoomIn pero sin factor x5 (más suave con rueda)
          const baseStep = this.currentZoom >= 2 ? 0.2 : 0.1;
          newZoom = this.currentZoom * (1 + baseStep);
        } else {
          // Zoom out - mismo cálculo que en zoomOut pero sin factor x5 (más suave con rueda)
          const baseStep = this.currentZoom <= 0.5 ? 0.05 : 0.1;
          newZoom = this.currentZoom * (1 - baseStep);
          newZoom = Math.max(0.1, newZoom);
        }
        
        // Ajustar posición para mantener el cursor en el mismo punto del diagrama
        this.zoomAtPoint(oldZoom, newZoom, mouseX, mouseY);
        
        // Actualizar zoom
        this.currentZoom = newZoom;
        this.updateZoom();
      });
    }

    // Auto-visualize on paste
    if (this.xmlInput) {
      this.xmlInput.addEventListener("paste", () => {
        setTimeout(() => this.visualizeXML(), 100);
      });
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "Enter":
            e.preventDefault();
            this.visualizeXML();
            break;
          case "=":
          case "+":
            e.preventDefault();
            this.zoomIn();
            break;
          case "-":
            e.preventDefault();
            this.zoomOut();
            break;
          case "0":
            e.preventDefault();
            this.resetZoom();
            break;
        }
      }
    });
  }

  loadDefaultXML() {
    const defaultXML = `<?xml version="1.0" encoding="UTF-8"?>
<user>
    <name>John</name>
    <age>30</age>
    <email>john@example.com</email>
</user>`;
    
    // Check if the xmlInput element exists before trying to set its value
    if (this.xmlInput) {
      this.xmlInput.value = defaultXML;
      
      // Make sure we only try to visualize if everything is initialized properly
      setTimeout(() => {
        if (this.xmlInput && this.treeContainer) {
          this.visualizeXML();
        } else {
          console.warn("Cannot visualize XML: required DOM elements are missing");
        }
      }, 500);
    } else {
      console.error("Cannot load default XML: xmlInput element not found");
    }
  }

  showStatus(message, type = "info") {
    // Check if statusMessage element exists before trying to access it
    if (!this.statusMessage) {
      // Try to get it again in case it was added after initialization
      this.statusMessage = document.getElementById("statusMessage");
      
      // If still not found, create it dynamically
      if (!this.statusMessage && this.treeContainer) {
        this.statusMessage = document.createElement("div");
        this.statusMessage.id = "statusMessage";
        this.statusMessage.className = "status-message";
        this.treeContainer.appendChild(this.statusMessage);
        console.log("Created missing statusMessage element dynamically");
      } else if (!this.statusMessage) {
        console.warn("Cannot create status message: treeContainer element not found");
        return;
      }
    }
    
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message status-${type}`;

    if (type === "success" || type === "info") {
      setTimeout(() => {
        // Check again in case the element was removed during the timeout
        if (this.statusMessage) {
          this.statusMessage.textContent = "";
          this.statusMessage.className = "status-message";
        }
      }, 3000);
    }
  }

  visualizeXML() {
    const xmlText = this.xmlInput.value.trim();

    if (!xmlText) {
      this.showStatus("Please enter XML code to visualize.", "error");
      return;
    }
    
    // Show processing indicator for large XML files
    if (xmlText.length > 500000) {
      this.showStatus("Processing large XML file...", "info");
    }

    try {
      // Reset state for new visualization
      this.nodeCache.clear();
      this.renderedNodes.clear();
      this.collapsedNodes.clear();
      
      // Use a try-catch with timeout to handle extremely large XML that might crash
      const startTime = performance.now();
      
      const parser = new DOMParser();
      
      // For very large XML, we'll use a timeout to prevent UI freezing
      if (xmlText.length > 1000000) { // 1MB+
        this.showStatus("Processing very large XML file. This may take a moment...", "info");
        
        // Use setTimeout to allow UI to update before processing
        setTimeout(() => {
          try {
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            
            const parseError = xmlDoc.querySelector("parsererror");
            if (parseError) {
              throw new Error("Invalid XML format: " + parseError.textContent);
            }
            
            this.processXmlDocument(xmlDoc, startTime);
          } catch (innerError) {
            this.handleXmlError(innerError);
          }
        }, 50);
      } else {
        // For smaller XML, process directly
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        const parseError = xmlDoc.querySelector("parsererror");
        if (parseError) {
          throw new Error("Invalid XML format: " + parseError.textContent);
        }
        
        this.processXmlDocument(xmlDoc, startTime);
      }
    } catch (error) {
      this.handleXmlError(error);
    }
  }
  
  processXmlDocument(xmlDoc, startTime) {
    // Parse tree with performance tracking
    this.treeData = this.parseXMLToTree(xmlDoc);
    
    // Reset position and zoom for new visualization
    this.panOffsetX = 0;
    this.panOffsetY = 0;
    this.currentZoom = 1;
    
    
    const parseTime = performance.now() - startTime;
    console.log(`XML parsing completed in ${parseTime.toFixed(2)}ms`);
    
    // Auto-collapse tree to show only first and second level
    this.autoCollapseDeepNodes(1);
    // Render the tree
    this.renderTree();
    
    const totalTime = performance.now() - startTime;
    const message = `XML visualized successfully in ${(totalTime/1000).toFixed(2)}s with ${this.totalNodeCount} nodes`;
    
    this.showStatus(message, "success");
  }
  
  handleXmlError(error) {
    if (error.message.includes("Maximum call stack size exceeded")) {
      this.showStatus("XML is too complex to process. Try a smaller file or simplify the structure.", "error");
    } else {
      this.showStatus(`Error parsing XML: ${error.message}`, "error");
    }
    console.error("XML parsing error:", error);
  }

  parseXMLToTree(xmlDoc) {
    const rootElements = Array.from(xmlDoc.childNodes).filter(
      (node) => node.nodeType === Node.ELEMENT_NODE
    );

    if (rootElements.length === 0) {
      throw new Error("No root element found in XML");
    }
    
    // Track total nodes to help manage large XML
    this.totalNodeCount = 0;
    
    // Show processing message for large XML
    const startTime = performance.now();
    
    // Use a non-recursive approach for large XML
    const result = rootElements.map((element) => this.parseElement(element));
    
    const endTime = performance.now();
    console.log(`XML parsing completed in ${(endTime - startTime).toFixed(2)}ms with ${this.totalNodeCount} nodes`);
    
    if (this.totalNodeCount > 100000) {
      this.showStatus(`Large XML detected (${this.totalNodeCount} nodes). Applying performance optimizations.`, "info");
    }
    
    return result;
  }

  parseElement(element, depth = 0, parentId = null) {
    // Check for processing limitations
    if (depth > 100) {
      return {
        id: this.generateId(),
        name: "Depth limit exceeded",
        type: "error",
        depth: depth,
        children: [],
        attributes: {},
        textContent: null,
        parentId: parentId
      };
    }
    
    // Count nodes for performance tracking
    this.totalNodeCount++;
    
    // Use local variables to reduce property lookups
    const id = this.generateId();
    const tagName = element.tagName;
    
    const node = {
      id,
      name: tagName,
      type: "element",
      depth: depth,
      children: [],
      attributes: {},
      textContent: null,
      parentId: parentId
    };

    // Parse attributes more efficiently
    if (element.attributes && element.attributes.length > 0) {
      const attrs = {};
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attrs[attr.name] = attr.value;
      }
      node.attributes = attrs;
    }

    // Use for loop instead of map for better performance with large collections
    const children = element.children;
    const childCount = children.length;
    
    // If there are too many children, limit them for initial rendering
    const maxInitialChildren = 1000;
    const tooManyChildren = childCount > maxInitialChildren;
    
    if (childCount > 0) {
      // Has child elements - use optimized loop instead of map
      const childNodes = [];
      const processCount = tooManyChildren ? maxInitialChildren : childCount;
      
      for (let i = 0; i < processCount; i++) {
        childNodes.push(this.parseElement(children[i], depth + 1, id));
      }
      
      // Add a placeholder node if we limited the children
      if (tooManyChildren) {
        childNodes.push({
          id: this.generateId(),
          name: `... ${childCount - maxInitialChildren} more items`,
          type: "placeholder",
          depth: depth + 1,
          children: [],
          attributes: {},
          textContent: null,
          parentId: id
        });
      }
      
      node.children = childNodes;
    } else {
      // Check for text content more efficiently
      const textContent = element.textContent ? element.textContent.trim() : "";
      if (textContent) {
        const textNodeId = this.generateId();
        node.children.push({
          id: textNodeId,
          name: textContent.length > 50 ? textContent.substring(0, 47) + "..." : textContent,
          type: "text",
          depth: depth + 1,
          children: [],
          attributes: {},
          textContent: textContent,
          parentId: id
        });
      }
    }

    return node;
  }

  generateId() {
    return "node_" + Math.random().toString(36).substr(2, 9);
  }

  renderTree() {
    if (!this.treeData || this.treeData.length === 0) {
      this.treeContainer.innerHTML =
        '<div class="empty-state"><div class="empty-icon">🌳</div><p>No data to visualize</p></div>';
      return;
    }
    
    // Start performance tracking
    const renderStart = performance.now();
    
    // Clear node cache to ensure fresh event handlers on full re-renders
    this.nodeCache.clear();
    
    // Reset tracking for optimized rendering
    this.renderedNodes = new Set();

    // Dimensiones adecuadas para el lienzo, manteniendo la capacidad infinita
    const infiniteSize = 100000;
    const { width, height } = this.calculateTreeDimensions();
    const canvasWidth = Math.max(width, infiniteSize);
    const canvasHeight = Math.max(height, infiniteSize);

    // Position nodes alrededor del origen (0,0)
    this.positionNodes();

    // Calcular los límites reales del diagrama antes de crear el SVG
    const bounds = this.getDiagramBounds();

    // Create SVG
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "tree-svg");
    svg.setAttribute("data-node-count", this.totalNodeCount || 0);
    
    // Definir un viewBox que se centre perfectamente en el contenido actual
    // con un margen para que se vea bien
    const margin = 100;
    const viewBoxX = bounds.minX - margin;
    const viewBoxY = bounds.minY - margin;
    const viewBoxWidth = bounds.width + 2 * margin;
    const viewBoxHeight = bounds.height + 2 * margin;
    
    svg.setAttribute("viewBox", `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
    svg.style.transform = `translate(${this.panOffsetX}px, ${this.panOffsetY}px) scale(${this.currentZoom})`;
    
    // Configurar el SVG para que se comporte como un lienzo infinito
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.position = "absolute";

    // Optimization for large trees: use layer groups for better performance
    const gridLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridLayer.setAttribute("class", "grid-layer");
    
    const connectionsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    connectionsLayer.setAttribute("class", "connections-layer");
    
    const nodesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    nodesLayer.setAttribute("class", "nodes-layer");

    // Agregar grid de fondo (efecto visual de lienzo infinito)
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.setAttribute("id", "grid");
    pattern.setAttribute("width", "40");
    pattern.setAttribute("height", "40");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 40 0 L 0 0 0 40");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(255, 255, 255, 0.03)");
    path.setAttribute("stroke-width", "1");
    
    pattern.appendChild(path);
    defs.appendChild(pattern);
    svg.appendChild(defs);
    
    const grid = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    grid.setAttribute("width", "100%");
    grid.setAttribute("height", "100%");
    grid.setAttribute("fill", "url(#grid)");
    gridLayer.appendChild(grid);
    
    svg.appendChild(gridLayer);
    svg.appendChild(connectionsLayer);
    svg.appendChild(nodesLayer);

    this.renderConnections(connectionsLayer);
    this.renderNodes(nodesLayer);
    
    this.treeContainer.innerHTML = "";
    this.treeContainer.appendChild(svg);
    
    // Adjust zoom after initial rendering only (preserve camera on node toggles)
    if (this.isFirstRender) {
      this.adjustInitialZoom();
      this.isFirstRender = false;
    }
    
    // Log performance
    const renderEnd = performance.now();
    console.log(`Tree rendered in ${(renderEnd - renderStart).toFixed(2)}ms`);
  }
  
  progressiveRender(svg, connectionsLayer, nodesLayer, loadingIndicator) {
    const startTime = performance.now();
    let progress = 0;
    const progressBar = loadingIndicator.querySelector(".progress");
    
    // First render connections - usually fewer and simpler elements
    this.renderConnections(connectionsLayer);
    progress = 30;
    progressBar.style.width = `${progress}%`;
    
    // Then render nodes in chunks
    const chunkSize = 100; // Render 100 nodes per frame
    let renderedNodeCount = 0;
    const totalNodes = this.countVisibleNodes(this.treeData);
    
    const renderNextChunk = () => {
      // Update progress
      progress = 30 + Math.min(70 * (renderedNodeCount / totalNodes), 69);
      progressBar.style.width = `${progress}%`;
      
      // Render next chunk
      this.renderNodesChunk(nodesLayer, chunkSize);
      renderedNodeCount += chunkSize;
      
      // Check if we need to continue
      if (renderedNodeCount < totalNodes && this.renderedNodes.size < this.visibleNodeLimit) {
        // Use requestAnimationFrame to avoid blocking the UI
        requestAnimationFrame(renderNextChunk);
      } else {
        // Rendering complete
        progressBar.style.width = "100%";
        
        // Wait a moment, then remove the loading indicator
        setTimeout(() => {
          if (loadingIndicator && loadingIndicator.parentNode) {
            loadingIndicator.parentNode.removeChild(loadingIndicator);
          }
          
          // Adjust zoom after rendering is complete
          this.adjustInitialZoom();
          
          // Log performance
          const renderEnd = performance.now();
          console.log(`Progressive tree rendering completed in ${(renderEnd - startTime).toFixed(2)}ms`);
          console.log(`Rendered ${this.renderedNodes.size} of ${totalNodes} nodes`);
          
          // Show message if we limited the rendering
          if (this.renderedNodes.size < totalNodes) {
            this.showStatus(`Large tree optimized: showing ${this.renderedNodes.size} of ${totalNodes} nodes. Zoom in to see more details.`, "info");
          }
        }, 500);
      }
    };
    
    // Start the progressive rendering
    requestAnimationFrame(renderNextChunk);
  }
  
  countVisibleNodes(nodeList) {
    let count = 0;
    
    const traverse = (nodes) => {
      count += nodes.length;
      
      nodes.forEach(node => {
        if (node.children && node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
          traverse(node.children);
        }
      });
    };
    
    traverse(nodeList);
    return count;
  }
  
  renderNodesChunk(container, chunkSize) {
    // If we've already reached our limit, don't render more
    if (this.renderedNodes.size >= this.visibleNodeLimit) {
      return;
    }
    
    let nodesRendered = 0;
    
    const renderNodeChunk = (nodeList) => {
      for (let i = 0; i < nodeList.length; i++) {
        // Stop if we've reached our chunk size
        if (nodesRendered >= chunkSize) {
          return true;
        }
        
        const node = nodeList[i];
        
        // Skip if this node was already rendered
        if (this.renderedNodes.has(node.id)) {
          continue;
        }
        
        // Render this node
        this.renderSingleNode(container, node);
        this.renderedNodes.add(node.id);
        nodesRendered++;
        
        // Check children if not collapsed
        if (node.children && node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
          const chunkComplete = renderNodeChunk(node.children);
          if (chunkComplete) return true;
        }
      }
      
      return false;
    };
    
    renderNodeChunk(this.treeData);
  }
  
  adjustInitialZoom() {
    // Ajustar el zoom para que el diagrama se ajuste bien a la pantalla inicialmente
    const bounds = this.getDiagramBounds();
    const containerRect = this.treeContainer.getBoundingClientRect();
    
    // Calcular el factor de escala ideal para que el diagrama se ajuste a la pantalla
    const scaleX = (containerRect.width * 0.9) / bounds.width;
    const scaleY = (containerRect.height * 0.9) / bounds.height;
    
    // Usar la escala más pequeña para asegurar que todo el diagrama quepa
    const idealScale = Math.min(scaleX, scaleY);
    
    // Limitar la escala a un rango razonable
    this.currentZoom = Math.min(Math.max(idealScale, 0.5), 2);
    
    // Centrar el diagrama en el contenedor
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    this.panOffsetX = 0; // El viewBox ya está centrado, no necesitamos desplazamiento horizontal
    this.panOffsetY = 0; // El viewBox ya está centrado, no necesitamos desplazamiento vertical
    
    this.updateZoom();
  }
  
  centerDiagram() {
    // Simplemente reiniciamos el zoom y ajustamos la escala inicial
    this.currentZoom = 1;
    this.panOffsetX = 0;
    this.panOffsetY = 0;
    this.adjustInitialZoom();
  }

  calculateTreeDimensions() {
    const maxDepth = this.getMaxDepth(this.treeData);
    const maxWidth = this.getMaxWidthAtAnyLevel();

    // Dimensiones mínimas necesarias para el contenido del árbol
    const contentWidth = maxWidth * (this.nodeWidth + this.nodeSpacing) + 200;
    const contentHeight = maxDepth * this.levelHeight + 300;

    // Para un lienzo realmente "infinito" usamos dimensiones mucho mayores
    const width = Math.max(contentWidth * 3, 100000);
    const height = Math.max(contentHeight * 3, 100000);

    return { width, height, contentWidth, contentHeight };
  }
  
  // Obtener las dimensiones reales del diagrama para exportación
  getDiagramBounds() {
    if (!this.treeData || this.treeData.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }
    
    // Inicializar con valores extremos
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    // Función para recorrer el árbol y encontrar los límites
    const findBounds = (nodeList) => {
      nodeList.forEach(node => {
        // Comprobar los límites del nodo actual
        const nodeLeft = node.x;
        const nodeRight = node.x + this.nodeWidth;
        const nodeTop = node.y;
        const nodeBottom = node.y + this.nodeHeight;
        
        minX = Math.min(minX, nodeLeft);
        minY = Math.min(minY, nodeTop);
        maxX = Math.max(maxX, nodeRight);
        maxY = Math.max(maxY, nodeBottom);
        
        // Procesar nodos hijos si no están colapsados
        if (node.children && node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
          findBounds(node.children);
        }
      });
    };
    
    findBounds(this.treeData);
    
    // Añadir un margen para mejor visualización
    const margin = 50;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;
    
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  getMaxDepth(nodes) {
    let maxDepth = 0;

    const traverse = (nodeList, currentDepth) => {
      nodeList.forEach((node) => {
        maxDepth = Math.max(maxDepth, currentDepth);
        if (node.children.length > 0) {
          traverse(node.children, currentDepth + 1);
        }
      });
    };

    traverse(nodes, 0);
    return maxDepth + 1;
  }

  getMaxWidthAtAnyLevel() {
    const levelCounts = {};

    const traverse = (nodeList) => {
      nodeList.forEach((node) => {
        levelCounts[node.depth] = (levelCounts[node.depth] || 0) + 1;
        if (node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
          traverse(node.children);
        }
      });
    };

    traverse(this.treeData);
    return Math.max(...Object.values(levelCounts), 1);
  }

  positionNodes() {
    const roots = this.treeData;
    if (!roots || roots.length === 0) return;

    // ----- Paso 1: calcular el ancho de cada subárbol -----
    const calculateWidth = (node) => {
      if (!node.children || node.children.length === 0 || this.collapsedNodes.has(node.id)) {
        node.subtreeWidth = this.nodeWidth;
        return node.subtreeWidth;
      }

      let total = 0;
      for (let i = 0; i < node.children.length; i++) {
        total += calculateWidth(node.children[i]);
        if (i < node.children.length - 1) {
          total += this.nodeSpacing;
        }
      }

      node.subtreeWidth = Math.max(this.nodeWidth, total);
      return node.subtreeWidth;
    };

    roots.forEach(calculateWidth);

    // Calcular el ancho total de todas las raíces
    let totalRootWidth = 0;
    for (let i = 0; i < roots.length; i++) {
      totalRootWidth += roots[i].subtreeWidth;
      if (i < roots.length - 1) {
        totalRootWidth += this.nodeSpacing;
      }
    }

    let startX = -totalRootWidth / 2;

    // ----- Paso 2: asignar posiciones basadas en el ancho calculado -----
    const setPositions = (node, depth, x) => {
      node.x = x + (node.subtreeWidth - this.nodeWidth) / 2;
      node.y = depth * this.levelHeight;

      if (node.children && node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
        let childX = x;
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          setPositions(child, depth + 1, childX);
          childX += child.subtreeWidth + this.nodeSpacing;
        }
      }
    };

    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      setPositions(root, 0, startX);
      startX += root.subtreeWidth + this.nodeSpacing;
    }
  }

  renderNodes(svg) {
    // Use a non-recursive approach to prevent stack overflows with deep trees
    const nodeStack = [...this.treeData];
    let nodeCount = 0;
    const maxNodes = this.visibleNodeLimit;
    
    while (nodeStack.length > 0 && nodeCount < maxNodes) {
      const node = nodeStack.pop();
      
      // Skip if already rendered
      if (this.renderedNodes.has(node.id)) {
        continue;
      }
      
      this.renderSingleNode(svg, node);
      this.renderedNodes.add(node.id);
      nodeCount++;
      
      // Add children to stack if not collapsed
      if (node.children && node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
        // Add in reverse order to maintain expected visual hierarchy
        for (let i = node.children.length - 1; i >= 0; i--) {
          nodeStack.push(node.children[i]);
        }
      }
    }
    
    // If we hit the node limit, add a note to the UI
    if (nodeCount >= maxNodes && nodeStack.length > 0) {
      this.showStatus(`Showing ${nodeCount} nodes. Zoom in or collapse nodes to improve performance.`, "info");
    }
  }

  renderSingleNode(svg, node) {
    // Check if we can reuse a cached node
    if (this.nodeCache.has(node.id)) {
      const cachedNode = this.nodeCache.get(node.id);
      // Update position if needed
      cachedNode.setAttribute("transform", `translate(${node.x},${node.y})`);
      
      // Re-attach event handlers for toggle functionality if this is a node with children
      if (node.children && node.children.length > 0 && cachedNode.getAttribute("data-has-toggle") === "true") {
        // Remove any previous listeners and add a fresh one
        const newNode = cachedNode.cloneNode(true);
        newNode.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleNode(node.id);
        });
        svg.appendChild(newNode);
      } else {
        svg.appendChild(cachedNode);
      }
      return;
    }

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "class",
      `tree-node ${node.type === "text" ? "text-node" : node.type === "placeholder" ? "placeholder-node" : ""}`
    );
    group.setAttribute("data-node-id", node.id);
    
    // Use transform for better performance instead of setting individual x,y attributes
    group.setAttribute("transform", `translate(${node.x},${node.y})`);

    // Node rectangle - optimize by using 0,0 coordinates and transform
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("class", "node-rect");
    rect.setAttribute("x", 0);
    rect.setAttribute("y", 0);
    rect.setAttribute("width", this.nodeWidth);
    rect.setAttribute("height", this.nodeHeight);
    rect.setAttribute("rx", "10"); // Bordes redondeados

    // Node text - optimize by using relative coordinates
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("class", "node-text");
    text.setAttribute("x", this.nodeWidth / 2);
    text.setAttribute("y", this.nodeHeight / 2);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", "12px"); // Ensure text size is appropriate

    // Better text truncation logic
    let displayText = node.name || "";
    const maxLength = node.type === "placeholder" ? 30 : 10; // Allow longer text for placeholders
    if (displayText.length > maxLength) {
      displayText = displayText.substring(0, maxLength) + "...";
    }
    text.textContent = displayText;

    group.appendChild(rect);
    group.appendChild(text);

    // Add expand/collapse indicator for nodes with children
    if (node.children && node.children.length > 0) {
      const isCollapsed = this.collapsedNodes.has(node.id);
      // Usamos un rectángulo pequeño en lugar de un círculo para el indicador
      const indicator = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      indicator.setAttribute("class", "expand-indicator");
      indicator.setAttribute("x", this.nodeWidth - 22);
      indicator.setAttribute("y", 8);
      indicator.setAttribute("width", "14");
      indicator.setAttribute("height", "14");
      indicator.setAttribute("rx", "3");
      indicator.setAttribute("fill", "#818cf8");
      indicator.setAttribute("stroke", "#ffffff");
      indicator.setAttribute("stroke-width", "2");

      const indicatorText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      indicatorText.setAttribute("class", "expand-text");
      indicatorText.setAttribute("x", this.nodeWidth - 15);
      indicatorText.setAttribute("y", 15);
      indicatorText.setAttribute("text-anchor", "middle");
      indicatorText.setAttribute("dominant-baseline", "central");
      indicatorText.setAttribute("font-size", "12px");
      indicatorText.setAttribute("fill", "#ffffff");
      indicatorText.textContent = isCollapsed ? "+" : "−";

      group.appendChild(indicator);
      group.appendChild(indicatorText);

      // Add click handler for expand/collapse
      group.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleNode(node.id);
      });
      
      // Mark the group as having a toggle handler
      group.setAttribute("data-has-toggle", "true");
    } else {
      // Even nodes without children should be clickable to improve UX
      group.style.cursor = "default";
    }
    
    // Make the entire node element have a pointer cursor to indicate it's interactive
    if (node.children && node.children.length > 0) {
      group.style.cursor = "pointer";
      rect.style.cursor = "pointer";
    }
    
    // Cache the node for reuse if not in a placeholder
    if (node.type !== "placeholder" && this.totalNodeCount < 5000) {
      const cachedNode = group.cloneNode(true);
      this.nodeCache.set(node.id, cachedNode);
    }

    svg.appendChild(group);
  }

  renderConnections(svg) {
    // Use path batching for connections to improve performance
    // For large trees, we'll combine multiple paths into a single SVG element
    const pathData = [];
    const batchSize = 50; // Number of connections per path element
    
    const collectConnectionPaths = (nodeList) => {
      for (let i = 0; i < nodeList.length; i++) {
        const node = nodeList[i];
        
        if (node.children && node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
          for (let j = 0; j < node.children.length; j++) {
            const child = node.children[j];
            
            const startX = node.x + this.nodeWidth / 2;
            const startY = node.y + this.nodeHeight;
            const endX = child.x + this.nodeWidth / 2;
            const endY = child.y;
            const midY = startY + (endY - startY) / 2;

            // Add path to current batch
            pathData.push(`M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`);
            
            // When we reach batch size, create the path element and reset
            if (pathData.length >= batchSize) {
              createPathElement(pathData.join(' '));
              pathData.length = 0;
            }
          }
          
          // Continue with children
          collectConnectionPaths(node.children);
        }
      }
    };
    
    const createPathElement = (data) => {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("class", "connection-line");
      path.setAttribute("d", data);
      path.setAttribute("fill", "none");
      svg.appendChild(path);
    };
    
    // Start collecting paths
    collectConnectionPaths(this.treeData);
    
    // Create any remaining paths
    if (pathData.length > 0) {
      createPathElement(pathData.join(' '));
    }
  }

  toggleNode(nodeId) {
    // Use a more efficient approach for large trees
    if (this.totalNodeCount > 1000) {
      // First check if we're expanding or collapsing
      const isExpanding = this.collapsedNodes.has(nodeId);
      
      if (isExpanding) {
        this.collapsedNodes.delete(nodeId);
      } else {
        this.collapsedNodes.add(nodeId);
      }
      
      // For large trees, use a more efficient rendering approach
      if (this.totalNodeCount > 100000) {
        // Clear cached nodes to ensure fresh rendering
        this.nodeCache.clear();
        
        // Complete re-render is costly, so show loading indicator
        this.showStatus(isExpanding ? "Expanding node..." : "Collapsing node...", "info");
        
        // Use requestAnimationFrame for smoother UI
        requestAnimationFrame(() => {
          this.renderTree();
        });
      } else {
        // For moderately large trees, we can optimize by only updating affected parts
        this.partialRenderForNodeToggle(nodeId, isExpanding);
      }
    } else {
      // For small trees, the original approach is fine
      if (this.collapsedNodes.has(nodeId)) {
        this.collapsedNodes.delete(nodeId);
      } else {
        this.collapsedNodes.add(nodeId);
      }
      
      this.renderTree();
    }
  }
  
  partialRenderForNodeToggle(nodeId, isExpanding) {
    const svg = this.treeContainer.querySelector(".tree-svg");
    if (!svg) return;
    
    // Reset rendering tracking for the toggled node's branch
    this.resetRenderingForNode(nodeId);
    
    // Update node positions first
    this.positionNodes();
    
    // Re-render connections
    const connectionsLayer = svg.querySelector(".connections-layer");
    if (connectionsLayer) {
      connectionsLayer.innerHTML = "";
      this.renderConnections(connectionsLayer);
    }
    
    // For expanding: render additional nodes
    if (isExpanding) {
      const nodesLayer = svg.querySelector(".nodes-layer");
      if (nodesLayer) {
        // Find the node that was expanded
        this.findAndRenderChildrenOf(nodeId, nodesLayer);
      }
    }
    
    // Adjust the SVG viewBox if needed
    this.updateViewBox(svg);
  }
  
  resetRenderingForNode(nodeId) {
    // Find the node and its children
    const findNode = (nodeList, id) => {
      for (let i = 0; i < nodeList.length; i++) {
        if (nodeList[i].id === id) {
          return nodeList[i];
        }
        
        if (nodeList[i].children && nodeList[i].children.length > 0) {
          const found = findNode(nodeList[i].children, id);
          if (found) return found;
        }
      }
      return null;
    };
    
    const node = findNode(this.treeData, nodeId);
    if (!node) return;
    
    // Remove the node's children from rendered nodes
    const removeFromRendered = (n) => {
      this.renderedNodes.delete(n.id);
      if (n.children && n.children.length > 0) {
        n.children.forEach(removeFromRendered);
      }
    };
    
    node.children.forEach(removeFromRendered);
  }
  
  findAndRenderChildrenOf(nodeId, container) {
    // Find the node in the tree
    const findNodeAndRender = (nodeList) => {
      for (let i = 0; i < nodeList.length; i++) {
        const node = nodeList[i];
        
        if (node.id === nodeId) {
          // Found the node, render its children
          if (node.children && node.children.length > 0) {
            for (let j = 0; j < node.children.length; j++) {
              this.renderSingleNode(container, node.children[j]);
              this.renderedNodes.add(node.children[j].id);
            }
          }
          return true;
        }
        
        if (node.children && node.children.length > 0 && !this.collapsedNodes.has(node.id)) {
          if (findNodeAndRender(node.children)) {
            return true;
          }
        }
      }
      return false;
    };
    
    findNodeAndRender(this.treeData);
  }
  
  updateViewBox(svg) {
    // Recalculate diagram bounds and update viewBox
    const bounds = this.getDiagramBounds();
    const margin = 100;
    
    // Set the new viewBox
    svg.setAttribute("viewBox", `${bounds.minX - margin} ${bounds.minY - margin} ${bounds.width + 2 * margin} ${bounds.height + 2 * margin}`);
  }
  
  autoCollapseDeepNodes(maxVisibleDepth) {
    // Colapsa automáticamente los nodos que están por debajo del nivel maxVisibleDepth
    this.collapsedNodes.clear(); // Limpia cualquier estado anterior de colapso
    
    const collapseNodesAtDepth = (nodeList, currentDepth) => {
      for (let i = 0; i < nodeList.length; i++) {
        const node = nodeList[i];
        
        // Si estamos en el nivel de profundidad máximo y el nodo tiene hijos, colapsarlo
        if (currentDepth >= maxVisibleDepth && node.children && node.children.length > 0) {
          this.collapsedNodes.add(node.id);
        }
        
        // Continuar recursivamente con los hijos
        if (node.children && node.children.length > 0) {
          collapseNodesAtDepth(node.children, currentDepth + 1);
        }
      }
    };
    
    // Comenzar el colapso desde los nodos raíz
    collapseNodesAtDepth(this.treeData, 0);
    
    console.log(`Auto-collapsed nodes deeper than level ${maxVisibleDepth}`);
  }

  expandAll() {
    // For very large trees, warn the user
    if (this.totalNodeCount > 5000) {
      if (!confirm(`This tree contains ${this.totalNodeCount} nodes. Expanding all nodes may cause performance issues. Continue?`)) {
        return;
      }
    }
    
    this.collapsedNodes.clear();
    
    // Clear node cache to ensure fresh rendering
    this.nodeCache.clear();
    this.renderedNodes.clear();
    
    // For large trees, use progressive rendering
    if (this.totalNodeCount > 1000) {
      this.showStatus("Expanding all nodes, please wait...", "info");
      
      // Use setTimeout to avoid freezing the UI
      setTimeout(() => {
        this.renderTree();
      }, 100);
    } else {
      this.renderTree();
      this.showStatus("All nodes expanded", "info");
    }
  }

  collapseAll() {
    // Collect all nodes with children more efficiently
    this.collapsedNodes.clear();
    
    const addCollapsibleNodes = (nodeList) => {
      for (let i = 0; i < nodeList.length; i++) {
        const node = nodeList[i];
        if (node.children && node.children.length > 0) {
          this.collapsedNodes.add(node.id);
          addCollapsibleNodes(node.children);
        }
      }
    };

    addCollapsibleNodes(this.treeData);
    
    // Clear cache to ensure fresh rendering
    this.nodeCache.clear();
    this.renderedNodes.clear();
    
    this.renderTree();
    this.showStatus("All nodes collapsed", "info");
  }

  clearInput() {
    this.xmlInput.value = "";
    this.treeContainer.innerHTML =
      '<div class="empty-state"><div class="empty-icon">🌳</div><p>Enter XML code and click "Visualize Tree" to see the hierarchical structure</p></div>';
    this.statusMessage.textContent = "";
    this.statusMessage.className = "status-message";
    
    // Clear all data and caches to free memory
    this.cleanupMemory();
  }
  
  cleanupMemory() {
    // Clear all data structures to free memory
    this.treeData = null;
    this.collapsedNodes.clear();
    this.renderedNodes.clear();
    this.nodeCache.clear();
    this.totalNodeCount = 0;
    
    // Cancel any pending operations
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }
    
    if (this.detailLevelTimeout) {
      clearTimeout(this.detailLevelTimeout);
      this.detailLevelTimeout = null;
    }
    
    if (this.zoomTimeout) {
      clearTimeout(this.zoomTimeout);
      this.zoomTimeout = null;
    }
    
    if (this.dragAnimationFrame) {
      cancelAnimationFrame(this.dragAnimationFrame);
      this.dragAnimationFrame = null;
    }
    
    // Force garbage collection hint (not guaranteed but can help)
    setTimeout(() => {
      console.log('Memory cleanup complete');
    }, 100);
  }

  zoomIn() {
    // Increase zoom effect by 5x for button clicks
    const baseStep = this.currentZoom >= 2 ? 0.2 : 0.1;
    const adaptiveStep = baseStep * 5;
    
    // Guardar la posición actual antes de hacer zoom
    const oldZoom = this.currentZoom;
    // Usar multiplicación directa para un zoom más natural
    const newZoom = this.currentZoom * (1 + adaptiveStep);
    
    // Ajustar posición para mantener el punto de vista
    this.adjustZoomPosition(oldZoom, newZoom);
    
    // Actualizar el zoom
    this.currentZoom = newZoom;
    this.updateZoom();
    
    // Zoom in event has no additional actions
  }

  zoomOut() {
    // Increase zoom effect by 5x for button clicks
    const baseStep = this.currentZoom <= 0.5 ? 0.05 : 0.1;
    const adaptiveStep = baseStep * 5;
    
    // Guardar la posición actual antes de hacer zoom
    const oldZoom = this.currentZoom;
    // Usar multiplicación directa para un zoom más natural
    const newZoom = Math.max(0.1, this.currentZoom * (1 - adaptiveStep));
    
    // Ajustar posición para mantener el punto de vista
    this.adjustZoomPosition(oldZoom, newZoom);
    
    // Actualizar el zoom
    this.currentZoom = newZoom;
    this.updateZoom();
    
    // Check if we should reduce detail when zooming out
    // No additional actions when zooming out
  }
  
  // Ajusta la posición para mantener el centro de vista durante el zoom con botones
  adjustZoomPosition(oldZoom, newZoom) {
    if (!this.treeContainer) return;
    
    // Obtener dimensiones del contenedor
    const containerRect = this.treeContainer.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    
    // Al hacer zoom con botones, hacemos zoom desde el centro de la vista actual
    this.zoomAtPoint(oldZoom, newZoom, centerX, centerY);
  }
  
  // Ajusta el zoom manteniendo un punto específico fijo en la pantalla
  zoomAtPoint(oldZoom, newZoom, pointX, pointY) {
    if (!this.treeContainer) return;
    
    // El punto de vista debe mantenerse fijo en las coordenadas del cursor
    // Necesitamos encontrar el punto real del SVG bajo el cursor
    // Obtener el punto en coordenadas de SVG
    const svg = this.treeContainer.querySelector(".tree-svg");
    if (!svg) return;
    
    // Obtener el punto en coordenadas del SVG utilizando la transformación actual
    const svgPoint = this.getRelativeMousePosition(pointX, pointY, oldZoom);
    
    // Calcular los nuevos offsets que mantienen ese punto bajo el cursor después del zoom
    this.panOffsetX = pointX - svgPoint.x * newZoom;
    this.panOffsetY = pointY - svgPoint.y * newZoom;
  }
  
  // Calcula la posición del ratón en coordenadas del SVG
  getRelativeMousePosition(clientX, clientY, currentZoom) {
    // Coordenadas del punto en el espacio del SVG (antes de aplicar transformaciones)
    const x = (clientX - this.panOffsetX) / currentZoom;
    const y = (clientY - this.panOffsetY) / currentZoom;
    
    return { x, y };
  }

  resetZoom() {
    this.currentZoom = 1;
    // En lugar de resetear a 0, centrar el diagrama
    this.centerDiagram();
  }

  updateZoom() {
    try {
      // Check if the treeContainer exists
      if (!this.treeContainer) {
        console.warn("Cannot update zoom: treeContainer is not available");
        return;
      }
      
      const svg = this.treeContainer.querySelector(".tree-svg");
      if (!svg) {
        // No SVG element found, which is normal if no diagram is rendered yet
        return;
      }
      
      // Cancel any pending zoom operations
      if (this.zoomTimeout) {
        clearTimeout(this.zoomTimeout);
      }
      
      // Apply the transform with high quality rendering
      const highQualityTransform = `translate3d(${this.panOffsetX}px, ${this.panOffsetY}px, 0) scale(${this.currentZoom})`;
      svg.style.transform = highQualityTransform;
      
      // Maintain sharp rendering at different zoom levels
      const nodes = svg.querySelectorAll('.tree-node rect');
      
      // Add smooth transition only for explicit zoom actions, not for dragging
      if (!this.isDragging) {
        svg.classList.add('smooth-transform');
        
        this.zoomTimeout = setTimeout(() => {
          // Check if the element still exists before trying to modify it
          if (svg && svg.classList) {
            svg.classList.remove('smooth-transform');
          }
          this.zoomTimeout = null;
        }, 300);
      }
    } catch (error) {
      console.error("Error updating zoom:", error);
    }
  }
  
  // Add more nodes to the visualization when zooming in
  renderAdditionalNodes() {
    const svg = this.treeContainer.querySelector(".tree-svg");
    if (!svg) return;
    
    const nodesLayer = svg.querySelector(".nodes-layer");
    const connectionsLayer = svg.querySelector(".connections-layer");
    
    if (nodesLayer && connectionsLayer) {
      // Clear existing connections and rebuild them
      connectionsLayer.innerHTML = "";
      
      // Render additional nodes up to the current limit
      this.renderNodesChunk(nodesLayer, this.visibleNodeLimit - this.renderedNodes.size);
      
      // Re-render all connections
      this.renderConnections(connectionsLayer);
      
      console.log(`Detail level updated: now showing ${this.renderedNodes.size} nodes`);
    }
  }

  startDrag(e) {
    if (e.target.closest(".tree-node")) {
      // Si hizo clic en un nodo, no inicie el arrastre
      return;
    }
    
    this.isDragging = true;
    this.dragStartX = e.clientX - this.panOffsetX;
    this.dragStartY = e.clientY - this.panOffsetY;
    this.treeContainer.classList.add("is-dragging");
    
    // Disable transitions during drag for better performance
    const svg = this.treeContainer.querySelector(".tree-svg");
    if (svg) {
      svg.classList.remove("smooth-transform");
      svg.style.willChange = "transform"; // Hint for browser optimization
    }
  }

  drag(e) {
    if (!this.isDragging) return;
    
    // Use requestAnimationFrame for smoother dragging with less jank
    if (this.dragAnimationFrame) {
      cancelAnimationFrame(this.dragAnimationFrame);
    }
    
    this.dragAnimationFrame = requestAnimationFrame(() => {
      this.panOffsetX = e.clientX - this.dragStartX;
      this.panOffsetY = e.clientY - this.dragStartY;
      
      // Update transform with high quality rendering
      const svg = this.treeContainer.querySelector(".tree-svg");
      if (svg) {
        svg.style.transform = `translate3d(${this.panOffsetX}px, ${this.panOffsetY}px, 0) scale(${this.currentZoom})`;
      }
      
      this.dragAnimationFrame = null;
    });
  }

  endDrag() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    this.treeContainer.classList.remove("is-dragging");
    
    // Cancel any pending animation frame
    if (this.dragAnimationFrame) {
      cancelAnimationFrame(this.dragAnimationFrame);
      this.dragAnimationFrame = null;
    }
    
    // Reset willChange to free up resources
    const svg = this.treeContainer.querySelector(".tree-svg");
    if (svg) {
      svg.style.willChange = "auto";
    }
    
    // No additional actions needed after dragging
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.treeContainer.requestFullscreen().catch(err => {
        this.showStatus(`Error al activar pantalla completa: ${err.message}`, "error");
      });
    } else {
      document.exitFullscreen();
    }
  }

  downloadDiagram() {
    if (!this.treeData || this.treeData.length === 0) {
      this.showStatus("No hay un diagrama para descargar", "error");
      return;
    }
    
    try {
      const svg = this.treeContainer.querySelector(".tree-svg");
      if (!svg) {
        this.showStatus("No se encontró el diagrama SVG", "error");
        return;
      }
      
      // Calcular los límites exactos del diagrama para recortar solo esa área
      const bounds = this.getDiagramBounds();
      
      // Añadir un margen adicional para asegurar que todo el contenido sea visible
      const margin = 50;
      const exportBounds = {
        minX: bounds.minX - margin,
        minY: bounds.minY - margin,
        width: bounds.width + margin * 2,
        height: bounds.height + margin * 2
      };
      
      // Crear un nuevo SVG que solo contendrá la parte visible del diagrama
      const exportSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      
      // Configurar el SVG de exportación con el tamaño exacto del diagrama
      exportSvg.setAttribute("width", exportBounds.width);
      exportSvg.setAttribute("height", exportBounds.height);
      exportSvg.setAttribute("viewBox", `${exportBounds.minX} ${exportBounds.minY} ${exportBounds.width} ${exportBounds.height}`);
      
      // Añadir el fondo al SVG de exportación
      const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      background.setAttribute("width", "100%");
      background.setAttribute("height", "100%");
      background.setAttribute("fill", "#0f172a");
      exportSvg.appendChild(background);
      
      // Clonar los nodos y conexiones relevantes
      const contentGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      
      // Primero añadir las conexiones
      const connections = svg.querySelectorAll(".connection-line");
      connections.forEach(conn => {
        const clonedConn = conn.cloneNode(true);
        clonedConn.setAttribute("stroke", "#ffffff");
        clonedConn.setAttribute("stroke-width", "2");
        contentGroup.appendChild(clonedConn);
      });
      
      // Luego añadir los nodos
      const nodes = svg.querySelectorAll(".tree-node");
      nodes.forEach(node => {
        const clonedNode = node.cloneNode(true);
        
        // Aplicar estilos a los rectángulos de los nodos
        const nodeRects = clonedNode.querySelectorAll("rect");
        nodeRects.forEach(rect => {
          // Distinguir entre el rectángulo del nodo y el indicador de expansión
          if (rect.classList.contains("expand-indicator")) {
            rect.setAttribute("fill", "#4f46e5");
            rect.setAttribute("stroke", "#ffffff");
          } else {
            rect.setAttribute("fill", "#4f46e5");
            rect.setAttribute("stroke", "#ffffff");
            rect.setAttribute("stroke-width", "2");
            rect.setAttribute("rx", "10");
          }
        });
        
        // Aplicar estilos a los textos
        const nodeTexts = clonedNode.querySelectorAll("text");
        nodeTexts.forEach(text => {
          text.setAttribute("fill", "#ffffff");
          text.setAttribute("font-size", text.classList.contains("expand-text") ? "12px" : "14px");
          text.setAttribute("font-weight", "bold");
        });
        
        contentGroup.appendChild(clonedNode);
      });
      
      // Añadir el grupo de contenido al SVG de exportación
      exportSvg.appendChild(contentGroup);
      
      // Convertir el SVG a una cadena
      const svgData = new XMLSerializer().serializeToString(exportSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      // Crear una imagen desde el SVG
      const img = new Image();
      img.onload = () => {
        // Crear un canvas para convertir SVG a PNG
        const canvas = document.createElement("canvas");
        const scale = 2; // Mayor escala para mejor calidad
        canvas.width = exportBounds.width * scale;
        canvas.height = exportBounds.height * scale;
        
        const ctx = canvas.getContext("2d");
        ctx.scale(scale, scale);
        
        // Dibujar un gradiente como fondo
        const gradient = ctx.createLinearGradient(0, 0, exportBounds.width, exportBounds.height);
        gradient.addColorStop(0, "#0f172a");
        gradient.addColorStop(1, "#1e293b");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, exportBounds.width, exportBounds.height);
        
        // Dibujar el SVG sobre el fondo
        ctx.drawImage(img, 0, 0);
        
        // Descargar la imagen como PNG
        const imgUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = "tree-diagram.png";
        downloadLink.href = imgUrl;
        downloadLink.click();
        
        // Liberar recursos
        URL.revokeObjectURL(svgUrl);
        this.showStatus("Diagrama descargado correctamente", "success");
      };
      
      img.src = svgUrl;
      
    } catch (error) {
      console.error("Error al descargar el diagrama:", error);
      this.showStatus(`Error al descargar el diagrama: ${error.message}`, "error");
    }
  }
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
  // Critical elements that must exist
  const criticalElements = ["xmlInput", "treeContainer"];
  // Elements that can be created dynamically if needed
  const optionalElements = ["statusMessage"]; 
  // UI control elements
  const controlElements = ["visualizeBtn", "clearBtn", "expandAllBtn", 
                          "collapseAllBtn", "zoomInBtn", "zoomOutBtn", 
                          "resetZoomBtn", "fullscreenBtn", "downloadBtn"];
  
  // Check critical elements first
  const missingCritical = criticalElements.filter(id => !document.getElementById(id));
  
  if (missingCritical.length > 0) {
    console.error(`Missing critical DOM elements: ${missingCritical.join(", ")}`);
    // Add error message to the page if possible
    const container = document.body;
    if (container) {
      const errorMsg = document.createElement("div");
      errorMsg.style.color = "red";
      errorMsg.style.padding = "20px";
      errorMsg.style.margin = "20px";
      errorMsg.style.border = "1px solid red";
      errorMsg.innerHTML = `<h3>Error initializing XML Tree Visualizer</h3>
                           <p>Missing critical DOM elements: ${missingCritical.join(", ")}</p>
                           <p>Please check that your HTML includes all required elements.</p>`;
      container.prepend(errorMsg);
    }
    return;
  }
  
  // Check for optional elements that should be created if missing
  optionalElements.forEach(id => {
    if (!document.getElementById(id)) {
      console.log(`Optional element ${id} not found, will be created dynamically if needed`);
    }
  });
  
  // Check for UI control elements, warn but don't block initialization
  const missingControls = controlElements.filter(id => !document.getElementById(id));
  if (missingControls.length > 0) {
    console.warn(`Some UI control elements are missing: ${missingControls.join(", ")}. Some features may not work properly.`);
  }
  
  // All required elements are present, initialize the application
  window.xmlTreeVisualizer = new XMLTreeVisualizer();
});
