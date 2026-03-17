/**
 * Función compartida para imprimir etiquetas de Producto Terminado (4x3 pulgadas)
 * Optimizada para impresoras Meitong y navegadores Web Bluetooth (Bluefy)
 */
async function imprimirEtiquetaTerminado(printCharacteristic, fardo, silent = false) {
    if (!printCharacteristic) {
        throw new Error("Impresora no conectada");
    }

    const encoder = new TextEncoder();
    let cmd = "";

    // Helper para convertir fracciones (3/4) a decimales
    const parseFraction = (str) => {
        if (!str) return 0;
        if (String(str).includes('/')) {
            const parts = String(str).split('/');
            return parseInt(parts[0]) / parseInt(parts[1]);
        }
        return parseFloat(String(str).replace(',', '.')) || 0;
    };

    // Detectar unidad (ML, PT o M2)
    const prodName = (fardo.producto || "").toLowerCase();
    const isML = (fardo.unidad && fardo.unidad.toLowerCase() === 'ml') || prodName.includes('tranquilla') || prodName.includes('zocalo') || prodName.includes('deck');
    const isPT = (fardo.unidad && fardo.unidad.toLowerCase() === 'pt') || prodName.includes('reglas cepilladas');
    const unitLabel = isML ? "ML" : (isPT ? "PT" : "M2");

    // --- CONFIGURACIÓN DE LA ETIQUETA ---
    // Ajustado según Self-test de la MHT-L1081
    cmd += "SIZE 101 mm, 76 mm\r\n"; 
    cmd += "GAP 3 mm, 0 mm\r\n";
    cmd += "SET TEAR OFF\r\n"; // Desactiva el avance y retroceso automático entre etiquetas
    cmd += "SET BACKFEED OFF\r\n"; // Evita que la impresora regrese el papel antes de cada etiqueta
    cmd += "DIRECTION 1\r\n";
    cmd += "CLS\r\n";
    cmd += "DENSITY 12\r\n";

    // --- CÓDIGO DE BARRAS ---
    // Ajustado a x=60 para que no se corte en el margen izquierdo
    cmd += `BARCODE 60,20,"128",70,1,0,3,3,"${fardo.fardoNo}"\r\n`;
    
    // --- ENCABEZADOS ---
    // Usamos ROMAN.TTF para una apariencia más profesional y legible
    cmd += `TEXT 350,125,"3",0,1,1,2,"Lote: ${fardo.lote}"\r\n`;
    cmd += `TEXT 350,45,"3",0,2,2,2,"Fardo: ${fardo.fardoNo}"\r\n`;

    cmd += `BAR 40,155,720,3\r\n`; // Línea más gruesa (3) para mejor visibilidad

    // --- DETALLES DEL PRODUCTO ---
    cmd += `TEXT 323,175,"3",0,1,1,2,"${fardo.producto}"\r\n`;
    cmd += `TEXT 212,210,"3",0,1,1,2,"${fardo.grosor} x ${fardo.ancho} pulg - ${fardo.especie}"\r\n`;

    cmd += `BAR 40,240,720,3\r\n`;

    // --- TABLA DE PIEZAS ---
    cmd += `TEXT 60,260,"3",0,1,1,"LARGO"\r\n`;
    cmd += `TEXT 350,260,"3",0,1,1,"PIEZAS"\r\n`;
    if (!isPT) {
        cmd += `TEXT 650,260,"3",0,1,1,"${unitLabel}"\r\n`;
    }

    // INTENTO DE RECUPERACIÓN DE DETALLES SI FALTAN (Para compatibilidad con datos planos de Sheets)
    if (!fardo.detalles || fardo.detalles.length === 0) {
        const pzs = parseInt(fardo.Piezas || fardo.piezas || 0);
        const lrg = parseFloat(fardo.Largo || fardo.largo || fardo['Largo_Ft'] || fardo["Largo '"] || 0);
        
        if (pzs > 0 && lrg > 0) {
            fardo.detalles = [{ piezas: pzs, largo: lrg }];
        }
    }

    let y = 295;
    if (fardo.detalles && fardo.detalles.length > 0) {
        fardo.detalles.forEach(d => {
            if (y < 510) { 
                let metricVal = 0;
                if (isML) {
                    metricVal = d.piezas * (d.largo * 0.3048); // ML
                } else if (isPT) {
                    const g = parseFraction(fardo.grosor);
                    const a = parseFloat(fardo.ancho) || 0;
                    metricVal = (g * a * d.largo * d.piezas) / 12; // PT
                } else {
                    metricVal = d.piezas * (d.largo * 0.3048) * (fardo.ancho * 0.0254); // M2
                }
                
                cmd += `TEXT 60,${y},"3",0,1,1,"${d.largo}"\r\n`;
                cmd += `TEXT 350,${y},"3",0,1,1,"${d.piezas}"\r\n`;
                if (!isPT) {
                    cmd += `TEXT 650,${y},"3",0,1,1,"${metricVal.toFixed(2)}"\r\n`;
                }
                y += 35;
            }
        });
    } else {
        cmd += `TEXT 400,350,"3",0,1,1,2,"(Detalle no disponible)"\r\n`;
    }

    // --- TOTALES ---
    cmd += `BAR 40,515,720,3\r\n`;
    
    const totalPzs = fardo.detalles ? fardo.detalles.reduce((acc, d) => acc + d.piezas, 0) : 0;
    // Usamos fardo.m2 o fardo.ml o fardo.M2 (remoto) para el total
    const totalQty = fardo.m2 || fardo.ml || fardo.M2 || fardo.PT || fardo.p2 || 0;
    cmd += `TEXT 130,540,"3",0,1,1,"TOTAL PIEZAS: ${totalPzs > 0 ? totalPzs : '-'}"\r\n`;
    cmd += `TEXT 540,540,"3",0,1,1,3,"TOTAL: ${totalQty} ${unitLabel}"\r\n`;

    cmd += "PRINT 1,1\r\n";

    // --- ENVIAR A LA IMPRESORA (Chunking Optimizado) ---
    const encodedData = encoder.encode(cmd);
    
    // Configuración validada por el usuario para MHT-L1081
    const CHUNK_SIZE = 100; // Aumentamos el tamaño para mejorar significativamente la velocidad
    for (let i = 0; i < encodedData.length; i += CHUNK_SIZE) {
        const chunk = encodedData.slice(i, i + CHUNK_SIZE);
        // Usamos writeValueWithoutResponse si está disponible, es mucho más rápido
        if (printCharacteristic.properties.writeWithoutResponse) {
            await printCharacteristic.writeValueWithoutResponse(chunk);
        } else {
            await printCharacteristic.writeValue(chunk);
        }
        await new Promise(resolve => setTimeout(resolve, 20)); // Reducimos el tiempo entre paquetes a 20ms
    }

    if (!silent) alert("Etiqueta enviada a " + fardo.fardoNo);
}
