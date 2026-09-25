const GPFuel = (() => {
    const MIN_PLAUSIBLE = 1.5;
    const MAX_PLAUSIBLE = 40;
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });

    function madridDate(iso) {
        return dateFormatter.format(new Date(iso));
    }

    function madridMonth(iso) {
        return madridDate(iso).slice(0, 7);
    }

    function sorted(refuels) {
        return [...refuels].sort((a, b) => {
            if (a.odometer !== b.odometer) {
                return a.odometer - b.odometer;
            }
            return a.date.localeCompare(b.date);
        });
    }

    function intervals(refuels) {
        const list = sorted(refuels);
        const out = [];
        let anchor = null;
        let liters = 0;
        let cost = 0;
        for (const refuel of list) {
            if (refuel.missedBefore) {
                anchor = null;
                liters = 0;
                cost = 0;
            }
            if (anchor !== null) {
                liters += refuel.liters;
                cost += refuel.total;
            }
            if (!refuel.full) {
                continue;
            }
            if (anchor !== null) {
                const km = refuel.odometer - anchor.odometer;
                if (km > 0) {
                    const lPer100 = (liters / km) * 100;
                    out.push({
                        from: anchor.date,
                        to: refuel.date,
                        km,
                        liters,
                        cost,
                        lPer100,
                        suspicious: lPer100 < MIN_PLAUSIBLE || lPer100 > MAX_PLAUSIBLE,
                    });
                }
            }
            anchor = refuel;
            liters = 0;
            cost = 0;
        }
        return out;
    }

    function monthlySpend(refuels) {
        const months = {};
        for (const refuel of sorted(refuels)) {
            const month = madridMonth(refuel.date);
            if (!months[month]) {
                months[month] = 0;
            }
            months[month] += refuel.total;
        }
        const ordered = {};
        for (const key of Object.keys(months).sort()) {
            ordered[key] = +months[key].toFixed(2);
        }
        return ordered;
    }

    function savings(refuels, nationalByDate) {
        let amount = 0;
        let counted = 0;
        for (const refuel of refuels) {
            const reference = nationalByDate[madridDate(refuel.date)];
            if (typeof reference !== 'number') {
                continue;
            }
            amount += (reference - refuel.pricePerUnit) * refuel.liters;
            counted++;
        }
        return { amount, refuels: counted };
    }

    function estimateTank(vehicle, list, consumption) {
        let level = null;
        let previous = null;
        for (const refuel of list) {
            if (level !== null && previous) {
                level -= ((refuel.odometer - previous.odometer) * consumption) / 100;
                level = Math.max(0, level);
            }
            if (refuel.full) {
                level = vehicle.tankCapacity;
            } else if (level !== null) {
                level = Math.min(vehicle.tankCapacity, level + refuel.liters);
            }
            previous = refuel;
        }
        if (level === null || !previous) {
            return null;
        }
        const odometer = Math.max(vehicle.odometer || 0, previous.odometer);
        level -= ((odometer - previous.odometer) * consumption) / 100;
        return Math.max(0, Math.min(vehicle.tankCapacity, level));
    }

    function summary(vehicle, refuels) {
        const list = sorted(refuels);
        const valid = intervals(list).filter((interval) => !interval.suspicious);
        let km = 0;
        let liters = 0;
        let cost = 0;
        for (const interval of valid) {
            km += interval.km;
            liters += interval.liters;
            cost += interval.cost;
        }

        let avgConsumption = vehicle.homologated;
        let consumptionSource = 'homologated';
        let costPerKm = null;
        if (km > 0) {
            avgConsumption = (liters / km) * 100;
            consumptionSource = 'real';
            costPerKm = cost / km;
        }

        let totalCost = 0;
        let totalLiters = 0;
        for (const refuel of list) {
            totalCost += refuel.total;
            totalLiters += refuel.liters;
        }

        let odometer = vehicle.odometer || 0;
        let lastRefuel = null;
        if (list.length) {
            lastRefuel = list[list.length - 1];
            odometer = Math.max(odometer, lastRefuel.odometer);
        }

        let tankLiters = null;
        let tankPercent = null;
        let autonomyKm = null;
        if (avgConsumption > 0 && vehicle.tankCapacity > 0) {
            tankLiters = estimateTank(vehicle, list, avgConsumption);
            if (tankLiters !== null) {
                tankPercent = (tankLiters / vehicle.tankCapacity) * 100;
                autonomyKm = (tankLiters / avgConsumption) * 100;
            }
        }

        return {
            avgConsumption,
            consumptionSource,
            costPerKm,
            trackedKm: km,
            totalCost,
            totalLiters,
            refuelCount: list.length,
            odometer,
            lastRefuel,
            tankLiters,
            tankPercent,
            autonomyKm,
            months: monthlySpend(list),
        };
    }

    return { intervals, summary, monthlySpend, savings, madridDate, madridMonth };
})();
