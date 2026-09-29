const GPRecap = (() => {
    const WIDTH = 1080;
    const HEIGHT = 1920;
    const ORANGE = '#FF7A1A';
    const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    function fmt(value, digits) {
        return value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function periodPrefix(period) {
        const today = GPFuel.madridDate(new Date().toISOString());
        if (period === 'month') {
            return today.slice(0, 7);
        }
        if (period === 'year') {
            return today.slice(0, 4);
        }
        return '';
    }

    function periodLabel(period) {
        const today = GPFuel.madridDate(new Date().toISOString());
        if (period === 'month') {
            return `${MONTH_NAMES[Number(today.slice(5, 7)) - 1]} ${today.slice(0, 4)}`;
        }
        if (period === 'year') {
            return today.slice(0, 4);
        }
        return 'desde el principio';
    }

    function compute(vehicle, refuels, period) {
        const prefix = periodPrefix(period);
        const list = refuels
            .filter((r) => r.vehicleId === vehicle.id && GPFuel.madridDate(r.date).startsWith(prefix))
            .sort((a, b) => a.date.localeCompare(b.date));
        const unit = AlertsStore.unitFor(vehicle.fuel);
        const stats = { unit, label: periodLabel(period), vehicle: vehicle.name, count: list.length, total: 0, liters: 0 };
        const stations = {};
        let cheapest = null;
        let versusNational = 0;
        let hasNational = false;
        for (const refuel of list) {
            stats.total += refuel.total;
            stats.liters += refuel.liters;
            if (refuel.stationName) {
                if (!stations[refuel.stationName]) {
                    stations[refuel.stationName] = { count: 0, total: 0, liters: 0 };
                }
                stations[refuel.stationName].count += 1;
                stations[refuel.stationName].total += refuel.total;
                stations[refuel.stationName].liters += refuel.liters;
            }
            if (cheapest === null || refuel.pricePerUnit < cheapest.price) {
                cheapest = { price: refuel.pricePerUnit, station: refuel.stationName };
            }
            if (typeof refuel.nationalAvg === 'number') {
                versusNational += (refuel.nationalAvg - refuel.pricePerUnit) * refuel.liters;
                hasNational = true;
            }
        }
        stats.avgPrice = null;
        if (stats.liters > 0) {
            stats.avgPrice = stats.total / stats.liters;
        }
        stats.km = null;
        stats.consumption = null;
        stats.costPerKm = null;
        if (list.length >= 2) {
            stats.km = list[list.length - 1].odometer - list[0].odometer;
            const summary = GPFuel.summary(vehicle, list);
            if (summary.trackedKm > 0) {
                stats.consumption = summary.avgConsumption;
                stats.costPerKm = summary.costPerKm;
            }
        }
        stats.cheapest = cheapest;
        stats.topStation = null;
        stats.topStationInfo = '';
        let best = 0;
        for (const name of Object.keys(stations)) {
            if (stations[name].count > best) {
                best = stations[name].count;
                stats.topStation = name;
                let times = ' veces';
                if (best === 1) {
                    times = ' vez';
                }
                stats.topStationInfo = ' · ' + best + times + ' a ' + fmt(stations[name].total / stations[name].liters, 3) + ' €';
            }
        }
        stats.versusNational = null;
        if (hasNational) {
            stats.versusNational = versusNational;
        }
        return stats;
    }

    function fitText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) {
            return text;
        }
        let out = text;
        while (out.length > 3) {
            out = out.slice(0, -1);
            if (ctx.measureText(out + '…').width <= maxWidth) {
                return out + '…';
            }
        }
        return out;
    }

    function rowsOf(stats) {
        const rows = [];
        let litersLabel = 'Litros repostados';
        if (stats.unit === 'kg') {
            litersLabel = 'Kilos repostados';
        }
        rows.push([litersLabel, fmt(stats.liters, 1) + ' ' + stats.unit]);
        if (stats.avgPrice !== null) {
            rows.push(['Precio medio', fmt(stats.avgPrice, 3) + ' €/' + stats.unit]);
        }
        if (stats.km !== null && stats.km > 0) {
            rows.push(['Kilómetros recorridos', fmt(stats.km, 0) + ' km']);
        }
        if (stats.consumption !== null) {
            rows.push(['Consumo medio', fmt(stats.consumption, 1) + ' ' + stats.unit + '/100 km']);
        }
        if (stats.costPerKm !== null) {
            rows.push(['Coste por km', fmt(stats.costPerKm, 3) + ' €/km']);
        }
        if (stats.cheapest !== null) {
            let where = '';
            if (stats.cheapest.station) {
                where = ' · ' + stats.cheapest.station;
            }
            rows.push(['Tu repostaje más barato', fmt(stats.cheapest.price, 3) + ' €' + where]);
        }
        if (stats.topStation) {
            rows.push(['Donde más has repostado', stats.topStation + stats.topStationInfo]);
        }
        if (stats.versusNational !== null) {
            let text = 'Justo en la media';
            if (stats.versusNational >= 0.01) {
                text = 'Ahorras ' + fmt(stats.versusNational, 2) + ' €';
            } else if (stats.versusNational <= -0.01) {
                text = 'Pagas ' + fmt(-stats.versusNational, 2) + ' € de más';
            }
            rows.push(['Frente a la media de España', text]);
        }
        return rows;
    }

    function draw(stats) {
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = ORANGE;
        ctx.fillRect(0, 0, WIDTH, 24);
        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#FFFFFF';
        ctx.font = "800 64px 'Bricolage Grotesque', 'Inter', sans-serif";
        ctx.fillText('GASOLINERA', 72, 150);
        const wordWidth = ctx.measureText('GASOLINERA').width;
        ctx.fillStyle = ORANGE;
        ctx.fillText('+', 72 + wordWidth + 8, 150);

        ctx.fillStyle = '#BDB8AE';
        ctx.font = "600 40px 'Inter', sans-serif";
        ctx.fillText('Tu resumen · ' + stats.label, 72, 230);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(fitText(ctx, stats.vehicle, WIDTH - 144), 72, 286);

        ctx.fillStyle = '#BDB8AE';
        ctx.font = "600 44px 'Inter', sans-serif";
        ctx.fillText('Has gastado', 72, 480);
        ctx.fillStyle = ORANGE;
        ctx.font = "800 170px 'Bricolage Grotesque', 'Inter', sans-serif";
        ctx.fillText(fitText(ctx, fmt(stats.total, 2) + ' €', WIDTH - 144), 72, 650);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = "600 44px 'Inter', sans-serif";
        let noun = 'repostajes';
        if (stats.count === 1) {
            noun = 'repostaje';
        }
        ctx.fillText(`en ${stats.count} ${noun}`, 72, 722);

        let y = 770;
        for (const [label, value] of rowsOf(stats)) {
            ctx.fillStyle = '#2A2A2A';
            ctx.fillRect(72, y, WIDTH - 144, 3);
            ctx.fillStyle = '#BDB8AE';
            ctx.font = "600 34px 'Inter', sans-serif";
            ctx.fillText(label, 72, y + 58);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = "800 46px 'Bricolage Grotesque', 'Inter', sans-serif";
            ctx.fillText(fitText(ctx, value, WIDTH - 144), 72, y + 112);
            y += 128;
        }

        ctx.fillStyle = ORANGE;
        ctx.fillRect(0, HEIGHT - 24, WIDTH, 24);
        ctx.fillStyle = '#BDB8AE';
        ctx.font = "600 34px 'Inter', sans-serif";
        ctx.fillText('Hecho con Gasolinera+', 72, HEIGHT - 70);
        return canvas;
    }

    function bytesOf(text) {
        const out = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) {
            out[i] = text.charCodeAt(i) & 255;
        }
        return out;
    }

    function pdfFromJpeg(dataUrl, width, height) {
        const jpeg = bytesOf(atob(dataUrl.split(',')[1]));
        const pageWidth = 595;
        const pageHeight = Math.round(595 * height / width);
        const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`;
        const parts = [];
        const offsets = [];
        let length = 0;
        function push(chunk) {
            let data = chunk;
            if (typeof chunk === 'string') {
                data = bytesOf(chunk);
            }
            parts.push(data);
            length += data.length;
        }
        function object(number, body) {
            offsets[number] = length;
            push(`${number} 0 obj\n${body}\nendobj\n`);
        }
        push('%PDF-1.4\n');
        object(1, '<< /Type /Catalog /Pages 2 0 R >>');
        object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
        object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
        offsets[4] = length;
        push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
        push(jpeg);
        push('\nendstream\nendobj\n');
        object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        const xref = length;
        let table = 'xref\n0 6\n0000000000 65535 f \n';
        for (let i = 1; i <= 5; i++) {
            table += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
        }
        push(table);
        push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
        return new Blob(parts, { type: 'application/pdf' });
    }

    function canvasBlob(canvas, type) {
        return new Promise((resolve) => canvas.toBlob(resolve, type));
    }

    function isNative() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    async function deliver(blob, name, share) {
        const file = new File([blob], name, { type: blob.type });
        if ((share || isNative()) && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: 'Mi resumen de Gasolinera+' });
                return;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    return;
                }
            }
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    async function exportImage(stats, share) {
        await deliver(await canvasBlob(draw(stats), 'image/png'), 'resumen-gasolinera.png', share);
    }

    async function exportPdf(stats, share) {
        const canvas = draw(stats);
        await deliver(pdfFromJpeg(canvas.toDataURL('image/jpeg', 0.92), canvas.width, canvas.height), 'resumen-gasolinera.pdf', share);
    }

    return { compute, draw, exportImage, exportPdf };
})();
