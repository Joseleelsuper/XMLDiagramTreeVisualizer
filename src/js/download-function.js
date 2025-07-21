// Función mejorada de descarga para ser insertada en script.js

// Función mejorada de descarga para ser insertada en script.js

function downloadDiagram() {
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
