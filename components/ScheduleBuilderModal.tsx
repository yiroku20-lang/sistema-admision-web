import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';

interface ConfirmedUser {
    id: string;
    dni: string;
    nombres: string;
    tipo: string;
    cargo: string;
    email_personal?: string;
}

interface ScheduleBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    users: ConfirmedUser[];
    cargo: string;
    procesoName: string;
    procesoId: string;
}

interface Shift {
    id: string;
    startTime: string;
    endTime: string;
}

interface Group {
    id: string;
    name: string;
    users: ConfirmedUser[];
}

export const ScheduleBuilderModal: React.FC<ScheduleBuilderProps> = ({ isOpen, onClose, users, cargo, procesoName, procesoId }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [excludeWeekends, setExcludeWeekends] = useState(true);
    const [excludeDates, setExcludeDates] = useState<string[]>([]);
    const [excludeInput, setExcludeInput] = useState('');
    const [isRotative, setIsRotative] = useState(true);
    const [numGroups, setNumGroups] = useState(1);
    const [shifts, setShifts] = useState<Shift[]>([{ id: 'shift-1', startTime: '08:00', endTime: '11:00' }]);
    
    const [generatedSchedule, setGeneratedSchedule] = useState<{date: string, shifts: {shiftInfo: Shift, group: Group}[]}[] | null>(null);
    const [groups, setGroups] = useState<Group[]>([]);
    const [shiftOverrides, setShiftOverrides] = useState<Record<string, Shift | null>>({});
    
    const [isSaving, setIsSaving] = useState(false);
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailTarget, setEmailTarget] = useState<'all' | string>('all');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');

    useEffect(() => {
        if (showEmailModal) {
            setEmailSubject(`Horario de Labores - ${procesoName} - ${cargo}`);
            setEmailBody(`Estimado/a {{nombre}},\n\nAdjunto su horario de labores para el proceso ${procesoName} en su rol de ${cargo}.\n\nAtentamente,\nDirección de Admisión.\nUNSAAC`);
        }
    }, [showEmailModal, procesoName, cargo]);

    const [draggedUser, setDraggedUser] = useState<{userId: string, groupId: string} | null>(null);
    const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
    
    const [draggedShift, setDraggedShift] = useState<{date: string, userId: string, shift: Shift | null} | null>(null);
    const [draggedShiftOver, setDraggedShiftOver] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setGeneratedSchedule(null);
            setGroups([]);
            setShiftOverrides({});
            setDraggedUser(null);
            setDragOverTarget(null);
            setDraggedShift(null);
            setDraggedShiftOver(null);
            setExcludeDates([]);
        } else {
            loadFromDB();
        }
    }, [isOpen]);

    const loadFromDB = async () => {
        try {
            const { data: usersData, error } = await supabase
                .from('personal_sorteos')
                .select('id, horario_data')
                .eq('proceso_id', procesoId)
                .eq('cargo', cargo)
                .eq('estado_confirmacion', 'Confirmado')
                .not('horario_data', 'is', null);

            if (error) throw error;
            if (!usersData || usersData.length === 0) return;

            const newGroups: Group[] = [];
            const newSchedule: {date: string, shifts: {shiftInfo: Shift, group: Group}[]}[] = [];
            const newOverrides: Record<string, Shift | null> = {};

            usersData.forEach(ud => {
                if (!ud.horario_data || !Array.isArray(ud.horario_data) || ud.horario_data.length === 0) return;

                const userObj = users.find(u => u.id === ud.id);
                if (!userObj) return;

                // Grab the group name from the first shift (assuming group doesn't change day by day for now)
                const groupName = ud.horario_data[0].grupo || 'Grupo Desconocido';
                
                let g = newGroups.find(x => x.name === groupName);
                if (!g) {
                    g = { id: `grp-${newGroups.length+1}`, name: groupName, users: [] };
                    newGroups.push(g);
                }
                
                if (!g.users.find(u => u.id === userObj.id)) {
                    g.users.push(userObj);
                }

                ud.horario_data.forEach((shiftData: any) => {
                    let dayObj = newSchedule.find(d => d.date === shiftData.fecha);
                    if (!dayObj) {
                        dayObj = { date: shiftData.fecha, shifts: [] };
                        newSchedule.push(dayObj);
                    }
                    
                    const existingShiftForGroup = dayObj.shifts.find(s => s.group.id === g!.id);
                    if (!existingShiftForGroup) {
                        dayObj.shifts.push({
                            shiftInfo: {
                                id: `s-${Date.now()}-${Math.random()}`,
                                startTime: shiftData.hora_inicio,
                                endTime: shiftData.hora_fin
                            },
                            group: g!
                        });
                    }
                    
                    newOverrides[`${shiftData.fecha}_${ud.id}`] = {
                        id: `s-${Date.now()}-${Math.random()}`,
                        startTime: shiftData.hora_inicio,
                        endTime: shiftData.hora_fin
                    };
                });
            });

            // Sort schedule by date
            newSchedule.sort((a,b) => a.date.localeCompare(b.date));

            if (newGroups.length > 0) {
                setGroups(newGroups);
                setNumberGroupsStateFromLoad(newGroups.length);
                setGeneratedSchedule(newSchedule);
                setShiftOverrides(newOverrides);
            }
        } catch(e) {
            console.error("Error loading schedule from personal_sorteos:", e);
        }
    };

    const setNumberGroupsStateFromLoad = (groupsLen: number) => {
        if(groupsLen > 0) setNumGroups(groupsLen);
    };

    if (!isOpen) return null;

    const handleAddExcludeDate = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && excludeInput) {
            if (!excludeDates.includes(excludeInput)) {
                setExcludeDates([...excludeDates, excludeInput].sort());
            }
            setExcludeInput('');
        }
    };

    const removeExcludeDate = (d: string) => {
        setExcludeDates(excludeDates.filter(x => x !== d));
    };

    const handleAddShift = () => {
        setShifts([...shifts, { id: `shift-${Date.now()}`, startTime: '', endTime: '' }]);
    };

    const handleUpdateShift = (id: string, field: 'startTime' | 'endTime', value: string) => {
        setShifts(shifts.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const handleRemoveShift = (id: string) => {
        setShifts(shifts.filter(s => s.id !== id));
    };

    const generateSchedule = () => {
        if (!startDate || !endDate) return alert('Por favor, selecciona las fechas de inicio y fin.');
        if (numGroups < 1) return alert('El número de grupos debe ser al menos 1.');
        if (shifts.some(s => !s.startTime || !s.endTime)) return alert('Por favor, completa todas las horas de los turnos.');

        // Divide users into groups
        const sortedUsers = [...users].sort((a, b) => a.nombres.localeCompare(b.nombres));
        const newGroups: Group[] = Array.from({ length: numGroups }, (_, i) => ({
            id: `grp-${i + 1}`,
            name: `Grupo ${i + 1}`,
            users: []
        }));

        sortedUsers.forEach((user, index) => {
            newGroups[index % numGroups].users.push(user);
        });

        // Some groups might have fewer members if it doesn't divide evenly
        setGroups(newGroups);

        // Generate Dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        const schedule = [];
        
        let dayIndex = 0;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            // Safe date handling
            const isWeekendLocal = d.getDay() === 0 || d.getDay() === 6;
            
            // Adjust to get YYYY-MM-DD from local date safely without timezone shifting issues
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            if (excludeWeekends && isWeekendLocal) continue;
            if (excludeDates.includes(dateStr)) continue;
            
            const dailyShifts = [];
            for (let i = 0; i < shifts.length; i++) {
                const groupIndex = isRotative ? (dayIndex + i) % numGroups : i % numGroups;
                dailyShifts.push({
                    shiftInfo: shifts[i],
                    group: newGroups[groupIndex]
                });
            }

            schedule.push({ date: dateStr, shifts: dailyShifts });
            dayIndex++;
        }

        setGeneratedSchedule(schedule);
        setShiftOverrides({});
    };

    const generatePDFDoc = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO", 148, 15, { align: 'center' });
        doc.setFontSize(11);
        doc.text(`HORARIO DE VALIDACION DE DOCUMENTOS ${procesoName.toUpperCase()}`, 148, 22, { align: 'center' });
        doc.text(`DIRECCIÓN DE ADMISIÓN`, 148, 29, { align: 'center' });

        const mapDay = (dateStr: string) => {
            const parts = dateStr.split('-');
            const dStr = `${parts[0]}-${parts[1]}-${parts[2]}T12:00:00Z`;
            const d = new Date(dStr);
            const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
            return days[d.getUTCDay()];
        };

        let headRow = [
            { content: '', styles: { halign: 'center' } as any },
            { content: 'N°', styles: { halign: 'center', valign: 'middle' } as any },
            { content: 'NOMBRE Y APELLIDO', styles: { halign: 'center', valign: 'middle' } as any }
        ];

        generatedSchedule!.forEach(day => {
            const parts = day.date.split('-');
            const dateFmt = `${parts[2]}/${parts[1]}/${parts[0]}`;
            headRow.push({ content: `${mapDay(day.date)}\n${dateFmt}`, styles: { halign: 'center', valign: 'middle' } as any });
        });
        
        let bodyRows: any[] = [];
        let runningRowIdx = 0;

        groups.forEach((g, gIdx) => {
            g.users.forEach((u, uIdx) => {
                let row: any[] = [];
                
                if (uIdx === 0) {
                    const grpText = `G\nR\nU\nP\nO\n\n${gIdx + 1}`;
                    row.push({
                        content: grpText,
                        rowSpan: g.users.length,
                        styles: { valign: 'middle', halign: 'center', cellWidth: 8, fontStyle: 'bold' }
                    });
                }

                row.push({ content: (uIdx + 1).toString(), styles: { halign: 'center' } });
                row.push({ content: u.nombres });
                
                generatedSchedule!.forEach(day => {
                    const groupShift = day.shifts.find(s => s.group.id === g.id)?.shiftInfo;
                    
                    if (isRotative) {
                        if (uIdx === 0) {
                            row.push({
                                content: groupShift ? `${groupShift.startTime} - ${groupShift.endTime}` : '-',
                                rowSpan: g.users.length,
                                styles: { valign: 'middle', halign: 'center' }
                            });
                        }
                    } else {
                        const overrideKey = `${day.date}_${u.id}`;
                        const actualShift = shiftOverrides[overrideKey] !== undefined ? shiftOverrides[overrideKey] : groupShift;

                        row.push({
                            content: actualShift ? `${actualShift.startTime} - ${actualShift.endTime}` : '-',
                            styles: { valign: 'middle', halign: 'center' }
                        });
                    }
                });
                bodyRows.push(row);
                runningRowIdx++;
            });
        });

        autoTable(doc as any, {
            startY: 35,
            head: [headRow],
            body: bodyRows,
            theme: 'grid',
            headStyles: { fillColor: [139, 0, 0], textColor: 255, fontSize: 8, halign: 'center' },
            styles: { fontSize: 7, cellPadding: 1.5, lineColor: [180, 180, 180], lineWidth: 0.1, textColor: 0 },
            columnStyles: {
                1: { cellWidth: 8 }, 
                2: { cellWidth: 50 }, 
            },
            margin: { left: 10, right: 10 },
            didParseCell: function(data: any) {
                 if (data.section === 'head') {
                     data.cell.styles.fillColor = [139, 0, 0];
                     data.cell.styles.textColor = 255;
                     data.cell.styles.fontStyle = 'bold';
                 }
            }
        });
        return doc;
    };

    const exportToPDF = () => {
        if (!generatedSchedule || groups.length === 0) return;
        const doc = generatePDFDoc();
        doc.save(`Horario_${cargo}_${procesoName}.pdf`);
    };

    const handleSendEmail = async () => {
        if (!generatedSchedule || groups.length === 0) return;
        
        setIsSendingEmail(true);
        try {
            const doc = generatePDFDoc();
            const pdfBase64 = doc.output('datauristring').split(',')[1];
            
            let targets = users.filter(u => u.email_personal);
            if (emailTarget !== 'all') {
                targets = targets.filter(u => u.id === emailTarget);
            }

            if (targets.length === 0) {
                alert("No hay correos registrados para el destinatario o destinatarios seleccionados.");
                setIsSendingEmail(false);
                return;
            }

            for (const u of targets) {
                const bodyText = emailBody.replace(/{{nombre}}/g, u.nombres);
                const htmlBody = emailBody.replace(/{{nombre}}/g, `<strong>${u.nombres}</strong>`).replace(/\n/g, '<br/>');

                const res = await fetch('/api/send-email', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        to: u.email_personal,
                        subject: emailSubject,
                        text: bodyText,
                        html: htmlBody,
                        attachmentBase64: pdfBase64,
                        filename: `Horario_${cargo}_${procesoName}.pdf`
                    })
                });
                if (!res.ok) throw new Error(`Error en servidor enviando a ${u.nombres}`);
            }

            alert("Correos enviados exitosamente.");
            setShowEmailModal(false);
        } catch (e: any) {
            alert("Error al enviar correos: " + e.message);
        } finally {
            setIsSendingEmail(false);
        }
    };

    const handleShiftDragStart = (e: React.DragEvent, date: string, userId: string, shift: Shift | null) => {
        e.stopPropagation();
        setDraggedShift({ date, userId, shift });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (e.target && (e.target as HTMLElement).style) {
                (e.target as HTMLElement).style.opacity = '0.5';
            }
        }, 0);
    };

    const handleShiftDragEnd = (e: React.DragEvent) => {
        if (e.target && (e.target as HTMLElement).style) {
            (e.target as HTMLElement).style.opacity = '1';
        }
        setDraggedShift(null);
        setDraggedShiftOver(null);
    };

    const handleShiftDragOver = (e: React.DragEvent, date: string, userId: string) => {
        e.preventDefault();
        e.stopPropagation();
        const key = `${date}_${userId}`;
        if (draggedShiftOver !== key) setDraggedShiftOver(key);
        e.dataTransfer.dropEffect = 'move';
    };

    const handleShiftDrop = (e: React.DragEvent, targetDate: string, targetUserId: string, targetShift: Shift | null) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggedShiftOver(null);
        if (!draggedShift) return;
        if (draggedShift.date === targetDate && draggedShift.userId === targetUserId) return;

        setShiftOverrides(prev => ({
            ...prev,
            [`${draggedShift.date}_${draggedShift.userId}`]: targetShift,
            [`${targetDate}_${targetUserId}`]: draggedShift.shift
        }));
    };

    const handleDragStart = (e: React.DragEvent, userId: string, groupId: string) => {
        setDraggedUser({userId, groupId});
        e.dataTransfer.effectAllowed = 'move';
        // Remove direct style manipulation, we will use React state for classes
        setTimeout(() => {
            // Using a short timeout ensures the drag image captures the original element 
            // before we apply the semi-transparent state to the dragged DOM node.
        }, 0);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedUser(null);
        setDragOverTarget(null);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverTarget !== targetId) {
            setDragOverTarget(targetId);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // We only clear if necessary, but DragOver fires continuously so it's fine 
        // to rely on DragOver to set it.
    };

    const handleDrop = (e: React.DragEvent, targetUserId: string, targetGroupId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverTarget(null);
        if (!draggedUser) return;
        if (draggedUser.userId === targetUserId) return;
        
        setGroups(prev => {
            const newGroups = JSON.parse(JSON.stringify(prev)) as Group[];
            let userToMove: ConfirmedUser | undefined;
            
            for (const g of newGroups) {
                const idx = g.users.findIndex(u => u.id === draggedUser.userId);
                if (idx !== -1) {
                    userToMove = g.users[idx];
                    g.users.splice(idx, 1);
                    break;
                }
            }
            
            if (!userToMove) return prev;
            
            for (const g of newGroups) {
                if (g.id === targetGroupId) {
                    const targetIdx = g.users.findIndex(u => u.id === targetUserId);
                    if (targetIdx !== -1) {
                        g.users.splice(targetIdx, 0, userToMove);
                    } else {
                        g.users.push(userToMove);
                    }
                    break;
                }
            }
            return newGroups;
        });
    };

    const saveSchedule = async () => {
        if (!generatedSchedule || groups.length === 0) return;
        setIsSaving(true);
        try {
            // Because we don't have bulk update easily with the standard JS client
            // we will loop through each user and update their 'horario_data'
            const updates: Promise<any>[] = [];

            for (const group of groups) {
                for (const user of group.users) {
                    const userScheduleArray: any[] = [];
                    for (const day of generatedSchedule) {
                        const groupShift = day.shifts.find(s => s.group.id === group.id)?.shiftInfo;
                        
                        let actualShift = groupShift;
                        if (!isRotative) {
                            const overrideKey = `${day.date}_${user.id}`;
                            actualShift = shiftOverrides[overrideKey] !== undefined ? shiftOverrides[overrideKey] : groupShift;
                        }

                        if (actualShift) {
                            userScheduleArray.push({
                                fecha: day.date,
                                hora_inicio: actualShift.startTime,
                                hora_fin: actualShift.endTime,
                                grupo: group.name
                            });
                        }
                    }

                    if (userScheduleArray.length > 0) {
                        updates.push(
                            Promise.resolve(
                                supabase.from('personal_sorteos')
                                    .update({ horario_data: userScheduleArray })
                                    .eq('id', user.id)
                            )
                        );
                    }
                }
            }
            
            // Also nullify anyone who was removed from groups
            const allAssignedUserIds = new Set<string>();
            groups.forEach(g => g.users.forEach(u => allAssignedUserIds.add(u.id)));
            
            for (const u of users) {
                if (!allAssignedUserIds.has(u.id)) {
                     updates.push(
                         Promise.resolve(
                             supabase.from('personal_sorteos')
                                 .update({ horario_data: null })
                                 .eq('id', u.id)
                         )
                    );
                }
            }

            await Promise.all(updates);
            
            alert('Horario guardado exitosamente en el registro de cada persona.');
            onClose();
        } catch (e: any) {
            console.error('Error saving schedule', e);
            alert("Error al guardar el horario: " + (e.message || 'Error desconocido. Verifique que la columna "horario_data" tipo JSONB exista.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm shadow-2xl">
            <div className="bg-white rounded-2xl w-full max-w-[95vw] h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
                
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Generador de Horarios y Turnos</h2>
                        <p className="text-sm font-medium text-slate-500 mt-1 uppercase tracking-widest">{procesoName} <span className="mx-2">•</span> Cargo: {cargo} ({users.length} Seleccionados)</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-200 text-slate-500 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar Configuration */}
                    <div className="w-80 border-r border-slate-100 p-6 overflow-y-auto bg-white flex flex-col gap-6 hide-scrollbar flex-shrink-0">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Configuración Base</h3>
                        
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Fecha de Inicio</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-all" />
                        </div>
                        
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Fecha de Fin</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-all" />
                        </div>

                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors group mt-1">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={excludeWeekends} onChange={e => setExcludeWeekends(e.target.checked)} className="peer sr-only" />
                                <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </div>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-wider group-hover:text-slate-900">Excluir Sáb/Dom</span>
                        </label>

                        <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors group mt-1">
                            <div className="relative flex items-center">
                                <input type="checkbox" checked={isRotative} onChange={e => setIsRotative(e.target.checked)} className="peer sr-only" />
                                <div className="w-10 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-black text-slate-700 uppercase tracking-wider group-hover:text-slate-900">Turnos Rotativos</span>
                                <span className="text-[9px] text-slate-400 font-medium leading-tight">Alterna grupos por día</span>
                            </div>
                        </label>

                        {/* Feriados / Fechas Excluidas */}
                        <div className="flex flex-col gap-1.5 mt-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block mb-1">Feriados / Días a excluir</label>
                            <div className="flex bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary">
                                <input 
                                    type="date"
                                    value={excludeInput}
                                    onChange={e => setExcludeInput(e.target.value)}
                                    onKeyDown={handleAddExcludeDate}
                                    className="flex-1 px-4 py-2 bg-transparent text-sm font-medium outline-none"
                                />
                                <button
                                    onClick={() => {
                                        if (excludeInput && !excludeDates.includes(excludeInput)) {
                                            setExcludeDates([...excludeDates, excludeInput].sort());
                                            setExcludeInput('');
                                        }
                                    }}
                                    className="bg-slate-200 hover:bg-slate-300 px-3 flex items-center justify-center text-slate-600 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                </button>
                            </div>
                            {excludeDates.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {excludeDates.map(d => (
                                        <div key={d} className="flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded text-[10px] font-bold px-2 py-1">
                                            {d}
                                            <button onClick={() => removeExcludeDate(d)} className="hover:text-red-900 ml-1"><span className="material-symbols-outlined text-[12px] block">close</span></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5 mt-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Cantidad de Grupos</label>
                            <input type="number" min="1" max="20" value={numGroups} onChange={e => setNumGroups(parseInt(e.target.value) || 1)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-sm font-bold text-slate-800 focus:ring-2 focus:ring-primary outline-none transition-all" />
                        </div>

                        <div className="w-full h-px bg-slate-100 my-2"></div>
                        
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Turnos Diarios</h3>
                            <button onClick={handleAddShift} className="text-primary hover:text-primary/80 font-bold text-xs flex items-center gap-1 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-[16px]">add_circle</span> Añadir Turno
                            </button>
                        </div>
                        
                        <div className="flex flex-col gap-3">
                            {shifts.map((shift, idx) => (
                                <div key={shift.id} className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 relative group">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <input type="time" value={shift.startTime} onChange={e => handleUpdateShift(shift.id, 'startTime', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-primary outline-none" title="Hora Inicio" />
                                        </div>
                                        <span className="text-slate-400 font-bold">-</span>
                                        <div className="flex-1">
                                            <input type="time" value={shift.endTime} onChange={e => handleUpdateShift(shift.id, 'endTime', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-primary outline-none" title="Hora Fin" />
                                        </div>
                                    </div>
                                    {shifts.length > 1 && (
                                        <button onClick={() => handleRemoveShift(shift.id)} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200 shadow-sm" title="Quitar Turno">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={generateSchedule}
                            className="mt-6 w-full bg-slate-900 text-white rounded-xl py-3.5 font-black uppercase tracking-widest text-xs hover:bg-slate-800 active:scale-95 transition-all shadow-lg shadow-slate-200 flex flex-col items-center justify-center gap-0.5"
                        >
                            <span>Generar Vista Previa</span>
                            <span className="text-[9px] text-slate-400 font-bold tracking-normal italic normal-case">Rotación Automática Habilitada</span>
                        </button>
                    </div>

                    {/* Preview / Results Area */}
                    <div className="flex-1 bg-[#f8fafc] p-6 overflow-y-auto w-full">
                        {!generatedSchedule ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                <span className="material-symbols-outlined text-6xl mb-4 opacity-50">calendar_month</span>
                                <p className="font-medium">Configura los parámetros a la izquierda y presiona Generar</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Se han generado horarios para {generatedSchedule.length} días.</p>
                                        <p className="text-xs text-slate-500 font-medium">Se dividireron las {users.length} personas en {numGroups} grupos.</p>
                                        {excludeDates.length > 0 && <p className="text-xs text-red-500 font-medium mt-1">Días excluidos manualmente: {excludeDates.length}</p>}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button 
                                            onClick={() => setShowEmailModal(true)} 
                                            disabled={isSendingEmail}
                                            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {isSendingEmail ? (
                                                <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-[18px]">mail</span>
                                            )}
                                            {isSendingEmail ? 'Enviando...' : 'Notificar'}
                                        </button>
                                        <button onClick={exportToPDF} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg shadow-red-200 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span> PDF
                                        </button>
                                        <button 
                                            onClick={saveSchedule} 
                                            disabled={isSaving}
                                            className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all shadow-lg shadow-blue-200 flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {isSaving ? (
                                                <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-[18px]">save</span>
                                            )}
                                            {isSaving ? 'Guardando...' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden w-full overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-sm min-w-[800px]">
                                        <thead>
                                            <tr className="bg-blue-50 border-b-2 border-slate-200 text-slate-700">
                                                <th className="p-3 text-center w-12 border-r border-slate-200">#</th>
                                                <th className="p-3 font-black text-xs uppercase tracking-widest border-r border-slate-200 min-w-[200px]">NOMBRE Y APELLIDO</th>
                                                {generatedSchedule.map(day => {
                                                    const dObj = new Date(day.date + "T12:00:00Z");
                                                    const days = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
                                                    const dateStr = `${dObj.getUTCDate().toString().padStart(2, '0')}/${(dObj.getUTCMonth()+1).toString().padStart(2, '0')}`;
                                                    return (
                                                        <th key={day.date} className="p-3 text-center border-r border-slate-200 min-w-[120px]">
                                                            <div className="font-black text-xs">{days[dObj.getUTCDay()]}</div>
                                                            <div className="font-mono text-[10px] text-slate-500">{dateStr}</div>
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groups.map((g, gIdx) => (
                                                <React.Fragment key={g.id}>
                                                    {g.users.length === 0 ? (
                                                        <tr 
                                                            className={`border-b border-slate-100 bg-slate-50 border-dashed transition-all duration-200 ${dragOverTarget === g.id ? 'bg-blue-100 ring-2 ring-inset ring-primary' : ''}`}
                                                            onDragOver={(e) => handleDragOver(e, g.id)}
                                                            onDragLeave={handleDragLeave}
                                                            onDrop={(e) => handleDrop(e, '', g.id)}
                                                        >
                                                            <td className="p-0 border-r border-b-2 border-blue-100 bg-blue-50 text-center relative w-10 overflow-hidden h-12">
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <span className="-rotate-90 origin-center whitespace-nowrap font-black text-[10px] text-blue-700 tracking-[0.2em] uppercase">
                                                                        {g.name}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 border-r border-slate-100 text-[11px] font-bold text-slate-400 italic text-center">
                                                                Arrastra a alguien aquí
                                                            </td>
                                                            {generatedSchedule.map(day => (
                                                                <td key={day.date} className="border-r border-slate-200"></td>
                                                            ))}
                                                        </tr>
                                                    ) : g.users.map((u, uIdx) => (
                                                        <tr 
                                                            key={u.id} 
                                                            className={`border-b border-slate-100 transition-all duration-200 ${draggedUser?.userId === u.id ? 'opacity-40 bg-slate-200 scale-[0.99] shadow-inner' : 'hover:bg-slate-50'} ${dragOverTarget === u.id ? 'border-t-2 border-t-primary bg-primary/5' : ''}`}
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, u.id, g.id)}
                                                            onDragEnd={handleDragEnd}
                                                            onDragOver={(e) => handleDragOver(e, u.id)}
                                                            onDragLeave={handleDragLeave}
                                                            onDrop={(e) => handleDrop(e, u.id, g.id)}
                                                        >
                                                            
                                                            {uIdx === 0 && (
                                                                <td rowSpan={g.users.length} className="p-0 border-r border-b-2 border-blue-100 bg-blue-50 text-center relative w-10 overflow-hidden">
                                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                                        <span className="-rotate-90 origin-center whitespace-nowrap font-black text-[10px] text-blue-700 tracking-[0.2em] uppercase">
                                                                            {g.name}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            
                                                            <td className="p-2 border-r border-slate-100 text-[11px] font-bold text-slate-700 truncate max-w-[250px]">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="material-symbols-outlined text-[14px] cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing" title="Arrastrar para mover persona a otro grupo">drag_indicator</span>
                                                                    <span className="text-slate-400 font-mono text-[10px]">{(uIdx + 1).toString().padStart(2, '0')}</span>
                                                                    {u.nombres}
                                                                </div>
                                                            </td>

                                                            {generatedSchedule.map(day => {
                                                                const groupShift = day.shifts.find(s => s.group.id === g.id)?.shiftInfo;
                                                                
                                                                if (isRotative) {
                                                                    if (uIdx === 0) {
                                                                        return (
                                                                            <td key={day.date} rowSpan={g.users.length} className="p-0 border-r border-b border-slate-200 text-center font-bold text-[11px] text-slate-800 align-middle">
                                                                                <div className="h-full flex items-center justify-center px-4 py-8 bg-slate-50">
                                                                                    {groupShift ? `${groupShift.startTime} - ${groupShift.endTime}` : '-'}
                                                                                </div>
                                                                            </td>
                                                                        );
                                                                    }
                                                                    return null;
                                                                }

                                                                const overrideKey = `${day.date}_${u.id}`;
                                                                const actualShift = shiftOverrides[overrideKey] !== undefined ? shiftOverrides[overrideKey] : groupShift;

                                                                return (
                                                                    <td 
                                                                        key={day.date} 
                                                                        className={`p-1.5 border-r border-b border-slate-200 text-center align-middle transition-all ${draggedShiftOver === overrideKey ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-400' : ''}`}
                                                                        onDragOver={(e) => handleShiftDragOver(e, day.date, u.id)}
                                                                        onDrop={(e) => handleShiftDrop(e, day.date, u.id, actualShift || null)}
                                                                    >
                                                                        <div 
                                                                            draggable
                                                                            onDragStart={(e) => handleShiftDragStart(e, day.date, u.id, actualShift || null)}
                                                                            onDragEnd={handleShiftDragEnd}
                                                                            className={`w-full min-h-[36px] flex items-center justify-center rounded-lg cursor-grab active:cursor-grabbing transition-colors ${actualShift ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-100' : 'bg-slate-50 hover:bg-slate-100 text-transparent hover:text-slate-300 border border-transparent hover:border-slate-200 border-dashed'}`}
                                                                            title="Arrastrar celda de hora a otra persona"
                                                                        >
                                                                            <span className={`font-black text-[10px] tracking-widest ${draggedShift?.userId === u.id && draggedShift?.date === day.date ? 'opacity-30' : ''}`}>
                                                                                {actualShift ? `${actualShift.startTime} - ${actualShift.endTime}` : 'VACIÓ'}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Email Notification Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">mail</span> 
                                Enviar Horarios por Correo
                            </h3>
                            <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <span className="material-symbols-outlined shrink-0 text-xl block">close</span>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
                            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50 text-blue-800 text-sm flex gap-3">
                                <span className="material-symbols-outlined shrink-0 text-blue-600">info</span>
                                <div>
                                    <p className="font-bold mb-1">Información sobre el envío</p>
                                    <p>Se adjuntará automáticamente el archivo PDF <strong>Horario_{cargo}_{procesoName}.pdf</strong> con el horario generado a cada correo.</p>
                                    <p className="mt-1 text-xs">Usa <strong>{`{{nombre}}`}</strong> en el cuerpo del correo para personalizarlo con el nombre del destinatario.</p>
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Destinatario</label>
                                <select 
                                    className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                                    value={emailTarget}
                                    onChange={(e) => setEmailTarget(e.target.value)}
                                >
                                    <option value="all">A todos los administradores con correo</option>
                                    {users.filter(u => u.email_personal).map(u => (
                                        <option key={u.id} value={u.id}>{u.nombres}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Asunto</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold"
                                    value={emailSubject}
                                    onChange={(e) => setEmailSubject(e.target.value)}
                                />
                            </div>

                            <div className="grid gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Mensaje</label>
                                <textarea 
                                    rows={8}
                                    className="w-full border border-slate-200 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none whitespace-pre-wrap font-medium"
                                    value={emailBody}
                                    onChange={(e) => setEmailBody(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                            <button onClick={() => setShowEmailModal(false)} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                            <button 
                                onClick={handleSendEmail} 
                                disabled={isSendingEmail}
                                className="px-5 py-2 rounded-xl text-sm font-black tracking-widest uppercase text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {isSendingEmail ? (
                                    <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[18px]">send</span> 
                                )}
                                {isSendingEmail ? 'Enviando...' : 'Enviar Correos'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
