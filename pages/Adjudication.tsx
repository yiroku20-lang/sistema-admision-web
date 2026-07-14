import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  AdjudicationRanking,
  AdjudicationVacancy,
  CVCuadroAnual,
  CVModalidad,
} from "../types";
import Papa from "papaparse";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const ESCUELAS_POR_AREA = {
  A: [
    "Arquitectura",
    "Ingeniería Eléctrica",
    "Ingeniería Geológica",
    "Ingeniería Metalúrgica",
    "Ingeniería de Minas",
    "Ingeniería Mecánica",
    "Ingeniería Química",
    "Ingeniería Civil",
    "Ingeniería de Sistemas",
    "Matemática",
    "Física",
    "Ingeniería Electrónica",
    "Ingeniería Informática",
    "Ingeniería Petroquímica",
    "Ingeniería Agroindustrial",
  ],
  B: [
    "Agronomía",
    "Biología",
    "Enfermería",
    "Farmacia y Bioquímica",
    "Medicina Humana",
    "Zootecnia",
    "Odontología",
    "Ingeniería Forestal",
    "Ingeniería Agroambiental",
    "Medicina Veterinaria",
  ],
  C: ["Ciencias Administrativas", "Contabilidad", "Economía", "Turismo"],
  D: [
    "Antropología",
    "Arqueología",
    "Derecho",
    "Historia",
    "Ciencias de la Comunicación",
    "Psicología",
    "Educación",
    "Filosofía",
  ],
};

export default function Adjudication() {
  const [currentView, setCurrentView] = useState<"list" | "detail">("list");
  const [activeTab, setActiveTab] = useState<"adjudication" | "attendance">(
    "adjudication",
  );
  const [procesos, setProcesos] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [anios, setAnios] = useState<CVCuadroAnual[]>([]);
  const [selectedAnioId, setSelectedAnioId] = useState<string>("");
  const [modalidades, setModalidades] = useState<CVModalidad[]>([]);
  const [selectedModalidadId, setSelectedModalidadId] = useState<string>("");

  const [activeProcessName, setActiveProcessName] = useState<string>("");

  const selectedModalidadParaNueva =
    modalidades.find((m) => m.id === selectedModalidadId)?.nombre || "";

  const [ranking, setRanking] = useState<AdjudicationRanking[]>([]);
  const [vacancies, setVacancies] = useState<AdjudicationVacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState("A");
  const [dbError, setDbError] = useState<string | null>(null);

  const [selectedStudent, setSelectedStudent] =
    useState<AdjudicationRanking | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<string>("");

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAlreadyMigrated, setIsAlreadyMigrated] = useState(false);
  // NUEVOS ESTADOS PARA EL MODAL DE MIGRACIÓN
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [migrateDate, setMigrateDate] = useState("");
  const [migrateStatus, setMigrateStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [migrateMessage, setMigrateMessage] = useState("");
  const [csvMessage, setCsvMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Vacancy config state
  const [showConfigVacancies, setShowConfigVacancies] = useState(false);
  const [configVacanciesArea, setConfigVacanciesArea] = useState("A");
  const [configVacanciesData, setConfigVacanciesData] = useState<
    Record<string, number>
  >({});
  const [dynamicSchools, setDynamicSchools] = useState<Record<string, string[]>>(ESCUELAS_POR_AREA);

  // Attendance scanner state
  const [scannedDni, setScannedDni] = useState("");
  const [attendanceMessage, setAttendanceMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
    warnings?: {
      partRecord?: any;
      resRecord?: any;
      renRecord?: any;
    };
  } | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  // PDF Report
  const pdfRef = useRef<HTMLDivElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [reportData, setReportData] = useState<AdjudicationVacancy[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Pizarra Vacantes customized states
  const [showPizarraModal, setShowPizarraModal] = useState(false);
  const [pizarraFecha, setPizarraFecha] = useState("Miércoles 26 Noviembre");
  const [pizarraLugar, setPizarraLugar] = useState("auditorio de la Facultad de Ciencias Sociales");
  const [pizarraCosto, setPizarraCosto] = useState("S/300.00");
  const [pizarraMetodo, setPizarraMetodo] = useState("PAGAR EN EL AUDITORIO AL MOMENTO DE ADJUDICAR UNA VACANTE (no yape, ni tarjeta)");
  const [pizarraRequisitos, setPizarraRequisitos] = useState([
    "COPIA DNI AMPLIADO VIGENTE.",
    "CARNET DE POSTULANTE",
    "LAPICERO AZUL"
  ]);
  const [pizarraHorarios, setPizarraHorarios] = useState<Record<string, string>>({
    A: "9:00 Horas",
    B: "9:30 Horas",
    C: "10:00 Horas",
    D: "10:10 Horas"
  });

  // Ceremony MC states & refs
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedRankIndex, setSelectedRankIndex] = useState<number>(0);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const [schoolSearch, setSchoolSearch] = useState("");
  const schoolSearchRef = useRef<HTMLInputElement | null>(null);

  const [crossRefs, setCrossRefs] = useState<{
    participantes: Record<string, any>;
    reservas: Record<string, any>;
    renuncias: Record<string, any>;
  }>({ participantes: {}, reservas: {}, renuncias: {} });

  const fetchCrossReferences = async (studentList: AdjudicationRanking[]) => {
    if (!studentList || studentList.length === 0) {
      setCrossRefs({ participantes: {}, reservas: {}, renuncias: {} });
      return;
    }
    const dnis = studentList.map((s) => s.dni).filter(Boolean);
    if (dnis.length === 0) return;

    try {
      const [resPart, resReservas, resRenuncias] = await Promise.all([
        supabase.from("participantes").select("*").in("CODPOSTULANTE", dnis),
        supabase.from("reserva_vacantes_detalles").select("*, batch:reserva_vacantes_bloques(*)").in("student_code", dnis),
        supabase.from("renuncias").select("*").in("student_code", dnis)
      ]);

      const partMap: Record<string, any> = {};
      if (resPart.data) {
        resPart.data.forEach((p) => {
          partMap[String(p.CODPOSTULANTE).trim()] = p;
        });
      }

      const resMap: Record<string, any> = {};
      if (resReservas.data) {
        resReservas.data.forEach((r) => {
          resMap[String(r.student_code).trim()] = r;
        });
      }

      const renMap: Record<string, any> = {};
      if (resRenuncias.data) {
        resRenuncias.data.forEach((ren) => {
          renMap[String(ren.student_code).trim()] = ren;
        });
      }

      setCrossRefs({
        participantes: partMap,
        reservas: resMap,
        renuncias: renMap
      });
    } catch (error) {
      console.error("Error fetching cross-references:", error);
    }
  };

  useEffect(() => {
    fetchCrossReferences(ranking);
  }, [ranking]);

  useEffect(() => {
    const checkIfMigrated = async () => {
      if (!activeProcessName) {
        setIsAlreadyMigrated(false);
        return;
      }
      try {
        const { count, error } = await supabase
          .from("participantes")
          .select("*", { count: "exact", head: true })
          .eq("MODALIDAD", activeProcessName);

        if (!error && count !== null && count > 0) {
          setIsAlreadyMigrated(true);
        } else {
          setIsAlreadyMigrated(false);
        }
      } catch (err) {
        console.error("Error checking migration status in Adjudication:", err);
        setIsAlreadyMigrated(false);
      }
    };
    checkIfMigrated();
  }, [activeProcessName]);

  // Keep selected index valid when ranking changes, only reset on area or process change
  useEffect(() => {
    if (ranking.length === 0) {
      setSelectedRankIndex(-1);
    } else if (selectedRankIndex >= ranking.length) {
      setSelectedRankIndex(ranking.length - 1);
    } else if (selectedRankIndex < 0) {
      setSelectedRankIndex(0);
    }
  }, [ranking]);

  // Reset selected rank index when area or process changes
  useEffect(() => {
    if (ranking.length > 0) {
      setSelectedRankIndex(0);
    } else {
      setSelectedRankIndex(-1);
    }
  }, [selectedArea, activeProcessName]);

  // Smooth scroll selected student card into view
  useEffect(() => {
    if (selectedRankIndex >= 0 && cardRefs.current[selectedRankIndex]) {
      cardRefs.current[selectedRankIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedRankIndex]);

  // Focus school select or search input when adjudication modal opens
  useEffect(() => {
    if (showModal) {
      setSchoolSearch("");
      setTimeout(() => {
        if (schoolSearchRef.current) {
          schoolSearchRef.current.focus();
        } else if (selectRef.current) {
          selectRef.current?.focus();
        }
      }, 100);
    }
  }, [showModal]);

  // General keyboard listener for master of ceremonies
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting events when inside input/form
      const target = e.target as HTMLElement;
      if (
        (target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable) &&
        !showModal
      ) {
        return;
      }

      if (showModal) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowModal(false);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (selectedSchool) {
            confirmAdjudication();
          }
        }
        return;
      }

      // If other modals are open, do not intercept keys
      if (showCsvModal || showConfigVacancies) {
        return;
      }

      if (ranking.length === 0) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedRankIndex((prev) => Math.min(ranking.length - 1, prev + 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedRankIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const activeStudent = ranking[selectedRankIndex];
        if (
          activeStudent &&
          activeStudent.estado_asistencia &&
          !activeStudent.escuela_adjudicada
        ) {
          handleAdjudicateClick(activeStudent);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    ranking,
    selectedRankIndex,
    showModal,
    selectedSchool,
    showCsvModal,
    showConfigVacancies,
    activeProcessName,
  ]);

  const fetchProcesos = async () => {
    try {
      const { data: vData } = await supabase
        .from("adjudicacion_vacantes")
        .select("modalidad");
      const { data: rData } = await supabase
        .from("adjudicacion_ranking")
        .select("modalidad");
      const { data: cData } = await supabase
        .from("clasificacion_de_adjudicacion")
        .select("modalidad");

      const mods = new Set<string>();
      if (vData) vData.forEach((d) => mods.add(d.modalidad));
      if (rData) rData.forEach((d) => mods.add(d.modalidad));
      if (cData) cData.forEach((d) => mods.add(d.modalidad));

      setProcesos(Array.from(mods));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesos();
    fetchAnios();
  }, []);

  useEffect(() => {
    if (selectedAnioId) {
      fetchModalidades(selectedAnioId);
    } else {
      setModalidades([]);
      setSelectedModalidadId("");
    }
  }, [selectedAnioId]);

  useEffect(() => {
    if (activeProcessName) {
      fetchData();
    }
  }, [selectedArea, activeTab, activeProcessName]);

  // Periodic silent background poll (every 3.5 seconds) to handle latecomer attendance updates in real-time
  useEffect(() => {
    if (currentView !== "detail" || !activeProcessName) return;

    const timer = setInterval(() => {
      fetchData(true); // silent fetch
    }, 3500);

    return () => clearInterval(timer);
  }, [currentView, activeProcessName, selectedArea]);

  const fetchAnios = async () => {
    try {
      const { data, error } = await supabase
        .from("cv_cuadros_anuales")
        .select("*")
        .eq("estado", "Aprobado")
        .order("anio", { ascending: false });
      if (error) throw error;
      setAnios(data || []);
      if (data && data.length > 0) {
        setSelectedAnioId(data[0].id);
      }
    } catch (e: any) {
      console.error(e);
      setDbError(e.message);
    }
  };

  const fetchApprovedModalidadSchools = async (processName: string) => {
    try {
      // Obtener modalidades de cuadros aprobados
      const { data: modalitiesData, error: modError } = await supabase
        .from("cv_modalidades")
        .select("id, nombre, cuadro_id, cv_cuadros_anuales!inner(anio, estado)")
        .eq("cv_cuadros_anuales.estado", "Aprobado");
      if (modError) throw modError;
      // Normalización robusta e insensible a espacios, guiones, acentos y mayúsculas
      const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, " ").trim();
      const targetNorm = normName(processName);
      
      const matchedModalities = modalitiesData?.filter(m => {
        const mNorm = normName(m.nombre);
        return mNorm === targetNorm || mNorm.includes(targetNorm) || targetNorm.includes(mNorm);
      }) || [];
      if (matchedModalities.length > 0) {
        const modalityIds = matchedModalities.map((m) => m.id);
        // Fetch vacancies quantity greater than 0
        const { data: vacData, error: vacError } = await supabase
          .from("cv_vacantes")
          .select("escuela_id, cantidad")
          .in("modalidad_id", modalityIds)
          .gt("cantidad", 0);
        if (vacError) throw vacError;
        if (vacData && vacData.length > 0) {
          const escuelaIds = Array.from(new Set(vacData.map((v) => v.escuela_id)));
          // Fetch original escuelas
          const { data: escData, error: escError } = await supabase
            .from("cv_escuelas")
            .select("nombre, area")
            .in("id", escuelaIds)
            .order("nombre", { ascending: true });
          if (escError) throw escError;
          if (escData && escData.length > 0) {
            const grouped: Record<string, string[]> = { A: [], B: [], C: [], D: [] };
            escData.forEach((esc) => {
              const area = esc.area || "A";
              if (grouped[area]) {
                grouped[area].push(esc.nombre);
              }
            });
            setDynamicSchools(grouped);
            return;
          }
        }
      }
      setDynamicSchools(ESCUELAS_POR_AREA);
    } catch (e) {
      console.error("Error fetching approved modality schools:", e);
      setDynamicSchools(ESCUELAS_POR_AREA);
    }
  };

  useEffect(() => {
    if (activeProcessName) {
      fetchApprovedModalidadSchools(activeProcessName);
    } else {
      setDynamicSchools(ESCUELAS_POR_AREA);
    }
  }, [activeProcessName]);

  const fetchModalidades = async (cuadroId: string) => {
    try {
      const { data, error } = await supabase
        .from("cv_modalidades")
        .select("*")
        .eq("cuadro_id", cuadroId)
        .order("orden", { ascending: true });
      if (error) throw error;
      setModalidades(data || []);
      if (data && data.length > 0) {
        setSelectedModalidadId(data[0].id);
      } else {
        setSelectedModalidadId("");
      }
    } catch (e: any) {
      console.error(e);
      setDbError(e.message);
    }
  };

  useEffect(() => {
    if (activeTab === "attendance") {
      const scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          qrbox: { width: 300, height: 150 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          rememberLastUsedCamera: true,
        },
        false,
      );

      scannerRef.current = scanner;
      scanner.render(onScanSuccess, onScanFailure);

      return () => {
        scanner.clear().catch(console.error);
      };
    }
  }, [activeTab]);

  const onScanSuccess = (decodedText: string) => {
    const dniMatch = decodedText.match(/\d{8}/);
    if (dniMatch) {
      handleRegisterAttendance(dniMatch[0]);
    } else {
      handleRegisterAttendance(decodedText);
    }
  };

  const onScanFailure = () => {};

  const notifyAttendance = (
    text: string,
    type: "success" | "error" | "info",
    warnings?: {
      partRecord?: any;
      resRecord?: any;
      renRecord?: any;
    },
  ) => {
    setAttendanceMessage({ text, type, warnings });
    const delay = warnings && (warnings.partRecord || warnings.resRecord || warnings.renRecord) ? 10000 : 4000;
    setTimeout(() => setAttendanceMessage(null), delay);
  };

  const loadConfigVacancies = async (areaToLoad: string) => {
    try {
      setConfigVacanciesData({}); // Show empty temporarily
      const { data } = await supabase
        .from("adjudicacion_vacantes")
        .select("*")
        .eq("modalidad", activeProcessName)
        .eq("area", areaToLoad);

      const existing: Record<string, number> = {};
      if (data) {
        data.forEach((v) => {
          existing[v.escuela] = v.vacantes_totales;
        });
      }
      setConfigVacanciesData(existing);
    } catch (e) {
      console.error(e);
    }
  };

  const openPizarra = async () => {
    if (!activeProcessName) return;
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase
        .from("adjudicacion_vacantes")
        .select("*")
        .eq("modalidad", activeProcessName)
        .order("area", { ascending: true })
        .order("escuela", { ascending: true });

      if (error) throw error;
      const validData = (data || []).filter((d) => d.area !== "_");

      if (validData.length === 0) {
        alert("No hay vacantes configuradas para esta modalidad.");
        setGeneratingPdf(false);
        return;
      }

      setReportData(validData);
      setShowPizarraModal(true);
    } catch (e: any) {
      alert("Error al cargar vacantes para la pizarra: " + e.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const downloadPizarraImage = async () => {
    if (!pdfRef.current) return;
    setGeneratingPdf(true);
    try {
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#FFFFFF",
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `Pizarra_Vacantes_${activeProcessName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err: any) {
      alert("Error al generar imagen: " + err.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const generatePDFReport = async () => {
    if (!activeProcessName) return;
    setGeneratingPdf(true);
    try {
      const { data, error } = await supabase
        .from("adjudicacion_vacantes")
        .select("*")
        .eq("modalidad", activeProcessName)
        .order("area", { ascending: true })
        .order("escuela", { ascending: true });

      if (error) throw error;
      const validData = (data || []).filter((d) => d.area !== "_");

      if (validData.length === 0) {
        alert("No hay vacantes configuradas para esta modalidad.");
        setGeneratingPdf(false);
        return;
      }

      setReportData(validData);

      setTimeout(async () => {
        if (!pdfRef.current) {
          setGeneratingPdf(false);
          return;
        }

        try {
          const canvas = await html2canvas(pdfRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: null,
            logging: false,
          });

          const imgData = canvas.toDataURL("image/jpeg", 1.0);
          const pdf = new jsPDF({
            orientation: "landscape",
            unit: "px",
            format: [canvas.width, canvas.height],
          });

          pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);
          pdf.save(`Resumen_Vacantes_${activeProcessName}.pdf`);
        } catch (err: any) {
          console.error("html2canvas error:", err);
          alert("Error al renderizar el PDF: " + err.message);
        } finally {
          setGeneratingPdf(false);
        }
      }, 800);
    } catch (e: any) {
      console.error(e);
      alert("Error fetching vacantes: " + e.message);
      setGeneratingPdf(false);
    }
  };

  const exportOfficialExcelReport = async () => {
    if (!activeProcessName) return;
    setExportingExcel(true);
    try {
      // 1. Fetch all configuration vacancies
      const { data: allVacancies, error: vErr } = await supabase
        .from("adjudicacion_vacantes")
        .select("*")
        .eq("modalidad", activeProcessName);

      if (vErr) throw vErr;

      // 2. Fetch all adjudicated applicants
      let finalRanking: any[] = [];
      const res = await supabase
        .from("clasificacion_de_adjudicacion")
        .select("*")
        .eq("modalidad", activeProcessName)
        .not("escuela_adjudicada", "is", null)
        .order("orden_merito", { ascending: true });
        
      if (res.error && res.error.code === 'PGRST205') {
        const resFb = await supabase
          .from("adjudicacion_ranking")
          .select("*")
          .eq("modalidad", activeProcessName)
          .not("escuela_adjudicada", "is", null)
          .order("orden_merito", { ascending: true });
        finalRanking = resFb.data || [];
      } else {
        finalRanking = res.data || [];
      }

      // Filter area "_" vacancies if any
      const vacanciesList = (allVacancies || []).filter((v) => v.area !== "_");

      // Sort vacancies by Area then by Escuela name
      vacanciesList.sort((a, b) => {
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        return a.escuela.localeCompare(b.escuela);
      });

      // Prepare Sheet 1: Summary of Vacancies
      // Columns: Área, Escuela Profesional, Vacantes Ofertadas, Vacantes Cubiertas, Vacantes Sobrantes
      let totalOfertadas = 0;
      let totalCubiertas = 0;
      let totalSobrantes = 0;

      const summaryData = vacanciesList.map((v) => {
        // Count how many students adjudicated to this school of this modality
        const cubiertas = finalRanking.filter(
          (r) => r.escuela_adjudicada?.toUpperCase() === v.escuela?.toUpperCase()
        ).length;
        const sobrantes = Math.max(0, v.vacantes_totales - cubiertas);

        totalOfertadas += v.vacantes_totales;
        totalCubiertas += cubiertas;
        totalSobrantes += sobrantes;

        return {
          "Área": v.area,
          "Escuela Profesional": v.escuela,
          "Vacantes Ofertadas": v.vacantes_totales,
          "Vacantes Cubiertas": cubiertas,
          "Vacantes Sobrantes": sobrantes
        };
      });

      // Add Totals row to metadata
      const worksheet1Data = [
        ["UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO"],
        ["DIRECCIÓN DE ADMISIÓN"],
        [`REPORTE GENERAL DE VACANTES ADJUDICADAS - ${activeProcessName}`],
        [], // spacing
        ["Área", "Escuela Profesional", "Vacantes Ofertadas", "Vacantes Cubiertas", "Vacantes Sobrantes"]
      ];

      summaryData.forEach(row => {
        worksheet1Data.push([
          row["Área"],
          row["Escuela Profesional"],
          row["Vacantes Ofertadas"].toString(),
          row["Vacantes Cubiertas"].toString(),
          row["Vacantes Sobrantes"].toString()
        ]);
      });

      worksheet1Data.push([]);
      worksheet1Data.push([
        "",
        "TOTAL GENERAL",
        totalOfertadas.toString(),
        totalCubiertas.toString(),
        totalSobrantes.toString()
      ]);

      const worksheet1 = XLSX.utils.aoa_to_sheet(worksheet1Data);

      // Prepare Sheet 2: Relación de Adjudicados
      // Columns: Nº, Orden Mérito, DNI, Apellidos y Nombres, Puntaje, Área, Escuela Adjudicada
      const adjudicatedRows = [
        ["UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO"],
        ["DIRECCIÓN DE ADMISIÓN"],
        [`RELACIÓN OFICIAL DE POSTULANTES ADJUDICADOS - ${activeProcessName}`],
        [], // spacing
        ["Nº", "Orden Mérito", "DNI", "Apellidos y Nombres", "Puntaje", "Área", "Escuela Adjudicada"]
      ];

      finalRanking.forEach((r, idx) => {
        adjudicatedRows.push([
          (idx + 1).toString(),
          r.orden_merito.toString(),
          r.dni,
          r.nombre,
          r.nota.toString(),
          r.area,
          r.escuela_adjudicada || ""
        ]);
      });

      const worksheet2 = XLSX.utils.aoa_to_sheet(adjudicatedRows);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet1, "Resumen Vacantes");
      XLSX.utils.book_append_sheet(workbook, worksheet2, "Alumnos Adjudicados");

      XLSX.writeFile(workbook, `Reporte_Adjudicacion_${activeProcessName.replace(/[^a-zA-Z0-9-]/g, "_")}.xlsx`);
    } catch (err: any) {
      alert("Error al generar Excel: " + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  const exportOfficialPdfReport = async () => {
    if (!activeProcessName) return;
    setExportingPdf(true);
    try {
      // 1. Fetch all configuration vacancies
      const { data: allVacancies, error: vErr } = await supabase
        .from("adjudicacion_vacantes")
        .select("*")
        .eq("modalidad", activeProcessName);
      if (vErr) throw vErr;
      // 2. Fetch all adjudicated applicants
      let finalRanking: any[] = [];
      const res = await supabase
        .from("clasificacion_de_adjudicacion")
        .select("*")
        .eq("modalidad", activeProcessName)
        .not("escuela_adjudicada", "is", null)
        .order("orden_merito", { ascending: true });
        
      if (res.error && res.error.code === 'PGRST205') {
        const resFb = await supabase
          .from("adjudicacion_ranking")
          .select("*")
          .eq("modalidad", activeProcessName)
          .not("escuela_adjudicada", "is", null)
          .order("orden_merito", { ascending: true });
        finalRanking = resFb.data || [];
      } else {
        finalRanking = res.data || [];
      }
      // Filter area "_" vacancies if any
      const vacanciesList = (allVacancies || []).filter((v) => v.area !== "_");
      // Sort vacancies by Area then by Escuela name
      vacanciesList.sort((a, b) => {
        if (a.area !== b.area) return a.area.localeCompare(b.area);
        return a.escuela.localeCompare(b.escuela);
      });
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      // Official UNSAAC styling: Red (#800000) and Gold (#D4AF37) branding
      // Title Block
      doc.setFillColor(128, 0, 0); // Crimson Red
      doc.rect(0, 0, pageWidth, 42, "F");
      // Elegant gold divider line under the banner
      doc.setFillColor(212, 175, 55); // Metallic Gold (#D4AF37)
      doc.rect(0, 42, pageWidth, 2.5, "F");
      // Title text helper
      doc.setTextColor(255, 255, 255);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text("UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO", pageWidth / 2, 16, { align: "center" });
      
      doc.setTextColor(255, 193, 7); // Gold
      doc.setFontSize(11);
      doc.text("DIRECCIÓN DE ADMISIÓN - REPORTE OFICIAL DE ADJUDICACIÓN", pageWidth / 2, 26, { align: "center" });
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.text(`PROCESO: ${activeProcessName}`, pageWidth / 2, 35, { align: "center" });
      // Spacing and Report Summary Metadata
      doc.setTextColor(30, 41, 59); // Deep Slate
      doc.setFontSize(12);
      doc.setFont("Helvetica", "bold");
      doc.text("I. CUADRO RESUMEN DE VACANTES DE ADJUDICACIÓN", 14, 54);
      let totalOfertadas = 0;
      let totalCubiertas = 0;
      let totalSobrantes = 0;
      const vacanciesTableBody = vacanciesList.map((v) => {
        const cubiertas = finalRanking.filter(
          (r) => r.escuela_adjudicada?.toUpperCase() === v.escuela?.toUpperCase()
        ).length;
        const sobrantes = Math.max(0, v.vacantes_totales - cubiertas);
        totalOfertadas += v.vacantes_totales;
        totalCubiertas += cubiertas;
        totalSobrantes += sobrantes;
        return [
          v.area,
          v.escuela,
          v.vacantes_totales,
          cubiertas,
          sobrantes
        ];
      });
      // Add a Totals Row
      vacanciesTableBody.push([
        "",
        "TOTAL GENERAL",
        totalOfertadas,
        totalCubiertas,
        totalSobrantes
      ]);
      // Generate Table 1 - Vacancies (Width: 15 + 86 + 27 + 27 + 27 = 182mm)
      autoTable(doc, {
        startY: 58,
        head: [["ÁREA", "ESCUELA PROFESIONAL", "OFERTADAS", "CUBIERTAS", "SOBRANTES"]],
        body: vacanciesTableBody,
        theme: "striped",
        headStyles: {
          fillColor: [128, 0, 0],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          halign: "center"
        },
        columnStyles: {
          0: { cellWidth: 15, halign: "center" },
          1: { cellWidth: 86, halign: "left" },
          2: { cellWidth: 27, halign: "center" },
          3: { cellWidth: 27, halign: "center" },
          4: { cellWidth: 27, halign: "center" }
        },
        styles: {
          fontSize: 8.5,
          cellPadding: 3
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [30, 41, 59],
          fontStyle: "bold"
        },
        didParseCell: (data) => {
          // Boldeify total general row
          if (data.row.index === vacanciesTableBody.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [226, 232, 240];
          }
        }
      });
      // Section 2: Relación de Adjudicados
      // Starting from where the table ends
      let nextY = (doc as any).lastAutoTable.finalY + 15;
      // Add new page if not enough space
      if (nextY > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        nextY = 20;
      }
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(12);
      doc.setFont("Helvetica", "bold");
      doc.text("II. RELACIÓN DE POSTULANTES ADJUDICADOS", 14, nextY);
      const rankingTableBody = finalRanking.map((r, idx) => [
        idx + 1,
        r.orden_merito,
        r.dni,
        r.nombre,
        r.nota,
        r.area,
        r.escuela_adjudicada || ""
      ]);
      autoTable(doc, {
        startY: nextY + 5,
        head: [["Nº", "MÉRITO", "DNI", "APELLIDOS Y NOMBRES", "PUNTAJE", "ÁREA", "CARRERA ADJUDICADA"]],
        body: rankingTableBody,
        theme: "striped",
        headStyles: {
          fillColor: [30, 41, 59], // Slate Gray
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 8.5,
          halign: "center"
        },
        columnStyles: {
          0: { cellWidth: 10, halign: "center" },
          1: { cellWidth: 15, halign: "center" },
          2: { cellWidth: 22, halign: "center" },
          3: { cellWidth: 62, halign: "left" },
          4: { cellWidth: 18, halign: "center" },
          5: { cellWidth: 12, halign: "center" },
          6: { cellWidth: 43, halign: "left" }
        },
        styles: {
          fontSize: 8,
          cellPadding: 2.5
        }
      });
      // Add footer callback for page numbers
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.setFont("Helvetica", "normal");
        doc.text(
          `Pág. ${i} de ${totalPages} • Generado por UNSAAC Dirección de Admisión el ${new Date().toLocaleDateString()}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      }
      doc.save(`Reporte_Oficial_Adjudicados_${activeProcessName.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf`);
    } catch (err: any) {
      alert("Error al generar PDF: " + err.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleRegisterAttendance = async (dni: string) => {
    if (!dni || dni.trim() === "") return;

    if (scannerRef.current) {
      try {
        scannerRef.current.pause(true);
      } catch (e) {
        // Ignore if error on pause
      }
    }

    try {
      const { data, error } = await supabase
        .from("adjudicacion_ranking")
        .select("*")
        .eq("dni", dni)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          notifyAttendance(
            `DNI ${dni} no encontrado en el ranking de adjudicación.`,
            "error",
          );
        } else {
          throw error;
        }
      } else if (data) {
        // Query cross-reference databases in parallel
        const cleanDni = dni.trim();
        const [resPart, resReservas, resRenuncias] = await Promise.all([
          supabase.from("participantes").select("*").eq("CODPOSTULANTE", cleanDni),
          supabase.from("reserva_vacantes_detalles").select("*, batch:reserva_vacantes_bloques(*)").eq("student_code", cleanDni),
          supabase.from("renuncias").select("*").eq("student_code", cleanDni)
        ]);

        const partRec = resPart.data && resPart.data.length > 0 ? resPart.data[0] : null;
        const resRec = resReservas.data && resReservas.data.length > 0 ? resReservas.data[0] : null;
        const renRec = resRenuncias.data && resRenuncias.data.length > 0 ? resRenuncias.data[0] : null;

        const crossWarnings = (partRec || resRec || renRec)
          ? {
              partRecord: partRec,
              resRecord: resRec,
              renRecord: renRec,
            }
          : undefined;

        if (data.estado_asistencia) {
          notifyAttendance(
            `El postulante ${data.nombre} ya tiene su asistencia registrada.`,
            "info",
            crossWarnings
          );
        } else {
          const { error: updError } = await supabase
            .from("adjudicacion_ranking")
            .update({ estado_asistencia: true })
            .eq("id", data.id);

          if (updError) throw updError;
          notifyAttendance(
            `Asistencia registrada: ${data.nombre} (Puesto: ${data.orden_merito})`,
            "success",
            crossWarnings
          );
          fetchData();
        }
      }
    } catch (err: any) {
      notifyAttendance("Error conexion: " + err.message, "error");
    } finally {
      setScannedDni("");
      setTimeout(() => {
        if (scannerRef.current) {
          try {
            scannerRef.current.resume();
          } catch (e) {
            // Ignore if error on resume
          }
        }
      }, 2500);
    }
  };

  const handleCsvUpload = () => {
    if (!csvFile) {
      setCsvMessage({
        text: "Seleccione un archivo CSV primero.",
        type: "error",
      });
      return;
    }
    setCsvLoading(true);
    setCsvMessage(null);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const insertData = results.data.map((row: any) => ({
            orden_merito: parseInt(row.orden_merito, 10),
            dni: typeof row.dni === 'string' ? row.dni.trim() : row.dni,
            nombre: typeof row.nombre === 'string' ? row.nombre.trim() : row.nombre,
            area: typeof row.area === 'string' ? row.area.trim() : row.area,
            nota: parseFloat(row.nota),
            modalidad: activeProcessName,
          }));

          const validData = insertData.filter(
            (d) =>
              !isNaN(d.orden_merito) &&
              d.dni &&
              d.nombre &&
              d.area &&
              !isNaN(d.nota),
          );

          if (validData.length === 0) {
            setCsvMessage({
              text: "El CSV no contiene registros válidos o no tiene los encabezados correctos.",
              type: "error",
            });
            setCsvLoading(false);
            return;
          }

          const { error } = await supabase
            .from("adjudicacion_ranking")
            .insert(validData);
          if (error) throw error;

          setCsvMessage({
            text: `Se importaron ${validData.length} postulantes con éxito.`,
            type: "success",
          });
          setTimeout(() => {
            setShowCsvModal(false);
            setCsvFile(null);
            setCsvMessage(null);
            fetchData();
          }, 2000);
        } catch (err: any) {
          if (
            err.code === "42501" ||
            err.message?.includes("security policy")
          ) {
            setDbError("needs_sql");
            setShowCsvModal(false);
            return;
          }
          setCsvMessage({
            text: "Error al importar: " + err.message,
            type: "error",
          });
        } finally {
          setCsvLoading(false);
        }
      },
      error: (error) => {
        setCsvMessage({
          text: "Error al leer CSV: " + error.message,
          type: "error",
        });
        setCsvLoading(false);
      },
    });
  };

  const fetchData = async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
      setDbError(null);
    }
    try {
      // Limpiar marcador de proceso vacío "— SIN CONFIGURAR —" si ya existen vacantes reales
      if (activeProcessName) {
        try {
          const { data: allVac } = await supabase
            .from("adjudicacion_vacantes")
            .select("id, escuela")
            .eq("modalidad", activeProcessName);

          if (allVac && allVac.some((v) => v.escuela !== "— SIN CONFIGURAR —")) {
            await supabase
              .from("adjudicacion_vacantes")
              .delete()
              .eq("escuela", "— SIN CONFIGURAR —")
              .eq("modalidad", activeProcessName);
          }
        } catch (sweepError) {
          console.warn("Error running sweep cleanup", sweepError);
        }
      }

      // Intentamos cargar ranking
      let qRanking = null;
      let eRanking = null;

      const res = await supabase
        .from("clasificacion_de_adjudicacion")
        .select("*")
        .eq("modalidad", activeProcessName)
        .eq("area", selectedArea)
        .order("orden_merito", { ascending: true });
        
      if (res.error && res.error.code === 'PGRST205') {
        const resFb = await supabase
          .from("adjudicacion_ranking")
          .select("*")
          .eq("modalidad", activeProcessName)
          .eq("area", selectedArea)
          .order("orden_merito", { ascending: true });
        qRanking = resFb.data;
        eRanking = resFb.error;
      } else {
        qRanking = res.data;
        eRanking = res.error;
      }

      if (eRanking) {
        if (eRanking.code === "42P01") {
          setDbError("needs_sql");
          setLoading(false);
          return;
        }
        throw eRanking;
      }

      // Intentamos cargar vacantes
      const { data: qVacancies, error: eVacancies } = await supabase
        .from("adjudicacion_vacantes")
        .select("*")
        .eq("modalidad", activeProcessName)
        .eq("area", selectedArea);

      if (eVacancies) {
        if (eVacancies.code === "42P01") {
          setDbError("needs_sql");
          setLoading(false);
          return;
        }
        throw eVacancies;
      }

      setRanking(qRanking || []);
      setVacancies(qVacancies || []);
    } catch (err: any) {
      console.error(err);
      if (!silent) {
        setDbError(err.message);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const initTestData = async () => {
    if (
      !window.confirm(
        "¿Inicializar con datos de prueba generados aleatoriamente?",
      )
    )
      return;
    try {
      const areas = ["A", "B", "C", "D"];
      for (const a of areas) {
        // Insert Vacancies
        const sampleSchools = dynamicSchools[a as keyof typeof dynamicSchools] || [];
        const finalSample = sampleSchools.length > 0 ? sampleSchools : ESCUELAS_POR_AREA[a as keyof typeof ESCUELAS_POR_AREA];
        const vData = finalSample.map((esc) => ({
          escuela: esc,
          area: a,
          vacantes_totales: Math.floor(Math.random() * 5) + 2,
          vacantes_disponibles: 0,
          modalidad: activeProcessName,
        }));
        for (let v of vData) v.vacantes_disponibles = v.vacantes_totales;

        await supabase.from("adjudicacion_vacantes").insert(vData);

        // Insert Ranking
        const rData = Array.from({ length: 15 }).map((_, i) => ({
          orden_merito: i + 1,
          dni:
            "70" +
            Math.floor(Math.random() * 1000000)
              .toString()
              .padStart(6, "0"),
          nombre: `POSTULANTE DE PRUEBA ${a}-${i + 1}`,
          area: a,
          nota: (Math.random() * 5 + 10).toFixed(2), // 10.00 to 15.00
          estado_asistencia: Math.random() > 0.3,
          modalidad: activeProcessName,
        }));
        await supabase.from("adjudicacion_ranking").insert(rData);
      }
      fetchData();
      alert("Datos de prueba insertados con éxito.");
    } catch (err: any) {
      if (err.code === "42501" || err.message?.includes("security policy")) {
        setDbError("needs_sql");
        return;
      }
      alert("Error: " + err.message);
    }
  };

  const handleAdjudicateClick = (student: AdjudicationRanking) => {
    setSelectedStudent(student);
    setSelectedSchool(student.escuela_adjudicada || "");
    setShowModal(true);
  };

  const cancelAdjudication = async () => {
    if (isAlreadyMigrated) {
      alert("No se puede modificar un proceso ya finalizado.");
      return;
    }
    if (!selectedStudent) return;
    const prevSchool = selectedStudent.escuela_adjudicada;
    if (!prevSchool) return;

    try {
      const { error: rankErr } = await supabase
        .from("adjudicacion_ranking")
        .update({
          escuela_adjudicada: null,
          observacion: null,
        })
        .eq("id", selectedStudent.id);

      if (rankErr) throw rankErr;

      const prevVacancy = vacancies.find((v) => v.escuela === prevSchool);
      if (prevVacancy) {
        const { error: prevVacErr } = await supabase
          .from("adjudicacion_vacantes")
          .update({ vacantes_disponibles: prevVacancy.vacantes_disponibles + 1 })
          .eq("id", prevVacancy.id);
        if (prevVacErr) throw prevVacErr;
      }

      setShowModal(false);
      fetchData();
    } catch (e: any) {
      alert("Error al liberar vacante: " + e.message);
    }
  };

  const confirmAdjudication = async () => {
    if (isAlreadyMigrated) {
      alert("No se puede modificar un proceso ya finalizado.");
      return;
    }
    if (!selectedStudent || !selectedSchool) return;

    try {
      const prevSchool = selectedStudent.escuela_adjudicada;

      if (prevSchool === selectedSchool) {
        setShowModal(false);
        return;
      }

      const { error: rankErr } = await supabase
        .from("adjudicacion_ranking")
        .update({
          escuela_adjudicada: selectedSchool,
          observacion: "Adjudicado",
        })
        .eq("id", selectedStudent.id);

      if (rankErr) throw rankErr;

      if (prevSchool) {
        const prevVacancy = vacancies.find((v) => v.escuela === prevSchool);
        if (prevVacancy) {
          const { error: prevVacErr } = await supabase
            .from("adjudicacion_vacantes")
            .update({ vacantes_disponibles: prevVacancy.vacantes_disponibles + 1 })
            .eq("id", prevVacancy.id);
          if (prevVacErr) throw prevVacErr;
        }
      }

      const vacancy = vacancies.find((v) => v.escuela === selectedSchool);
      if (vacancy) {
        const { error: vacErr } = await supabase
          .from("adjudicacion_vacantes")
          .update({ vacantes_disponibles: vacancy.vacantes_disponibles - 1 })
          .eq("id", vacancy.id);

        if (vacErr) throw vacErr;
      }

      setShowModal(false);
      fetchData();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleApproveAndMigrate = async () => {
    if (!activeProcessName) return;
    if (isAlreadyMigrated) {
      alert("Este proceso ya ha sido aprobado y migrado de manera definitiva.");
      return;
    }
    const fechaIngresoValida = migrateDate.trim() || new Date().toISOString().split("T")[0];
    setIsSaving(true);
    setMigrateStatus("saving");
    setMigrateMessage("Migrando ingresantes, por favor espere...");
    try {
      // 1. Obtener la modalidad por nombre (normalización robusta)
      const { data: modalities, error: modErr } = await supabase
        .from("cv_modalidades")
        .select("*");
      if (modErr) throw modErr;
      
      const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, " ").trim();
      const targetNorm = normName(activeProcessName);
      let modality = modalities?.find(m => normName(m.nombre) === targetNorm);
      if (!modality) {
        modality = modalities?.find(m => normName(m.nombre).includes(targetNorm) || targetNorm.includes(normName(m.nombre)));
      }
      if (!modality) {
        throw new Error(`No se encontró la modalidad: ${activeProcessName}`);
      }
      // Obtener Cuadro Anual para obtener el año
      const { data: cuadro, error: cuadroErr } = await supabase
        .from("cv_cuadros_anuales")
        .select("anio")
        .eq("id", modality.cuadro_id)
        .maybeSingle();
      if (cuadroErr) throw cuadroErr;
      const anio = cuadro ? cuadro.anio : new Date().getFullYear().toString();
      const semestre = modality.semestre || "—";
      // 2. Obtener todas las escuelas para resolver códigos y filiales
      const { data: schools, error: schoolsErr } = await supabase
        .from("cv_escuelas")
        .select("nombre, codigo_carrera, filial");
      if (schoolsErr) throw schoolsErr;
      const schoolCodeMap: Record<string, string> = {};
      const schoolFilialMap: Record<string, string> = {};
      const findSchoolByString = (val: string) => {
        if (!val || !schools) return null;
        const normVal = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const words = normVal.split(/\s+/).filter(w => w.length > 2);
        
        let found = schools.find(s => 
          s.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === normVal ||
          s.codigo_carrera === val
        );
        if (found) return found;
        if (words.length > 0) {
          found = schools.find(s => {
            const eName = s.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return words.every(w => eName.includes(w));
          });
        }
        return found || null;
      };
      if (schools) {
        schools.forEach(s => {
          schoolCodeMap[s.nombre] = s.codigo_carrera;
          schoolFilialMap[s.nombre] = s.filial || "CUSCO";
        });
      }
      const getRowValue = (row: any, keys: string[]): string => {
        if (!row) return "";
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null) {
            return String(row[k]).trim();
          }
        }
        return "";
      };
      const checkAdmitted = (row: any): boolean => {
        const val = getRowValue(row, [
          'OBSERVACION', 'Observacion', 'observacion', 
          'OBSERVACIONES', 'observaciones', 
          'ESTADO', 'estado', 'resultado', 'RESULTADO'
        ]).toUpperCase();
        
        if (val.includes('NO INGRESA') || val.includes('NO INGRESANTE') || val.includes('NO INGRESO') || val.includes('NO ADMITIDO') || val.includes('NO_INGRESA')) {
          return false;
        }
        if (val.includes('INGRESA') || val.includes('INGRESO') || val.includes('ADMITIDO') || val === 'SI' || val.includes('INGRESANTE')) {
          return true;
        }
        const carreraIng = getRowValue(row, [
          'CarreraIngreso', 'carreraIngreso', 'CARRERA_INGRESO', 
          'carrera_ingreso', 'Carrera', 'carrera', 'CARRERA', 
          'escuela', 'Escuela', 'ESCUELA', 'codigo_carrera', 'COD_CARRERA'
        ]);
        if (!val && carreraIng) {
          const rowKeysLower = Object.keys(row).map(k => k.toLowerCase().replace(/[\s_-]/g, ''));
          const hasObsColumn = rowKeysLower.some(k => k.includes('observa') || k.includes('estado') || k.includes('result'));
          if (!hasObsColumn) {
            return true;
          }
        }
        return false;
      };
      // 3. Obtener el archivo CSV cargado en la pre-revisión mediante la API (Bypass RLS)
      const apiRes = await fetch(`/api/get-pre-revision/${modality.id}`);
      if (!apiRes.ok) {
        throw new Error(`Error al obtener los datos del CSV desde el servidor: ${apiRes.statusText}`);
      }
      const fileRecord = await apiRes.json();
      
      // CORRECCIÓN DEL TYPO AQUÍ (leer del objeto wrapper data)
      const record = fileRecord.data;
      let csvRows: any[] = [];
      if (record && record.csv_data) {
        csvRows = typeof record.csv_data === "string" 
          ? JSON.parse(record.csv_data) 
          : record.csv_data;
      }
      // Normalizar ingresantes regulares del CSV
      const directIngresantes: any[] = [];
      const careerCounts: Record<string, number> = {};
      csvRows.forEach(row => {
        if (row && checkAdmitted(row)) {
          const dni = getRowValue(row, ['NroDocumento', 'nroDocumento', 'NRODOCUMENTO', 'DNI', 'dni', 'Documento', 'documento', 'alumno', 'ALUMNO', 'CODPOSTULANTE', 'codpostulante']);
          const nombre = getRowValue(row, ['nombre', 'Nombre', 'NOMBRE', 'postulante', 'POSTULANTE', 'nombres', 'Nombres', 'NOMBRES', 'ApeNom', 'apenom']);
          const nota = getRowValue(row, ['Nota', 'nota', 'NOTA', 'Puntaje', 'puntaje', 'PUNTAJE']);
          const pos = getRowValue(row, ['POS', 'Pos', 'pos', 'posicion', 'Posicion', 'puesto', 'Puesto', 'OMERITO', 'omerito', 'orden_merito']);
          const rawCode = getRowValue(row, ['codigo_carrera', 'COD_CARRERA', 'codigo', 'Codigo', 'COD_CAR', 'cod_car', 'COD_ESC', 'cod_esc', 'COD_ESCP', 'cod_escp', 'CODIGO_CARRERA', 'CODIGO_ESCUELA', 'carrera_codigo', 'CODIGO', 'cod_carrera', 'CodCarrera']);
          let sch = null;
          if (rawCode) {
            sch = schools?.find(e => e.codigo_carrera === rawCode.trim());
          }
          if (!sch) {
            const rawIng = getRowValue(row, ['CarreraIngreso', 'carreraIngreso', 'CARRERA_INGRESO', 'carrera_ingreso', 'carrera_adjudicada', 'CARRERA_ADJUDICADA']);
            sch = findSchoolByString(rawIng);
          }
          if (!sch) {
            const rawPost = getRowValue(row, ['Escuela1', 'escuela1', 'ESCUELA1', 'carrera_postula', 'CARRERA_POSTULA', 'carrera_opcion', 'CARRERA_OPCION', 'opcion', 'OPCION', 'Carrera', 'carrera', 'CARRERA', 'escuela', 'Escuela', 'ESCUELA']);
            sch = findSchoolByString(rawPost);
          }
          const schoolName = sch ? sch.nombre : "";
          const schoolCode = sch ? sch.codigo_carrera : "";
          const filial = sch ? (sch.filial || "CUSCO") : "CUSCO";
          const orderNum = parseInt(pos) || 0;
          if (schoolName) {
            careerCounts[schoolName] = Math.max(careerCounts[schoolName] || 0, orderNum);
          }
          directIngresantes.push({
            CODPOSTULANTE: dni,
            NOMBRE: nombre,
            codigo_carrera: schoolCode,
            CARRERA: schoolName,
            FILIAL: filial,
            MODALIDAD: activeProcessName,
            SEMESTRE: semestre,
            ANIO: anio,
            NOTA: nota,
            OMERITO: pos || "—",
            FECHAINGRESO: fechaIngresoValida
          });
        }
      });
      // 4. Obtener estudiantes adjudicados
      const { data: adjRanking, error: adjErr } = await supabase
        .from("adjudicacion_ranking")
        .select("*")
        .eq("modalidad", activeProcessName)
        .eq("observacion", "Adjudicado");
      if (adjErr) throw adjErr;
      const adjStudentsBySchool: Record<string, typeof adjRanking> = {};
      if (adjRanking) {
        adjRanking.forEach(student => {
          const schName = student.escuela_adjudicada;
          if (schName) {
            if (!adjStudentsBySchool[schName]) {
              adjStudentsBySchool[schName] = [];
            }
            adjStudentsBySchool[schName].push(student);
          }
        });
      }
      const adjudicatedIngresantes: any[] = [];
      Object.entries(adjStudentsBySchool).forEach(([schName, students]) => {
        students.sort((a, b) => (parseFloat(a.nota) || 0) > (parseFloat(b.nota) || 0) ? -1 : 1);
        const baseMerit = careerCounts[schName] || 0;
        students.forEach((student, index) => {
          const schCode = schoolCodeMap[schName] || null;
          const filial = schoolFilialMap[schName] || "CUSCO";
          const newMerit = baseMerit + index + 1;
          adjudicatedIngresantes.push({
            CODPOSTULANTE: student.dni,
            NOMBRE: student.nombre,
            codigo_carrera: schCode,
            CARRERA: schName,
            FILIAL: filial,
            MODALIDAD: activeProcessName,
            SEMESTRE: semestre,
            ANIO: anio,
            NOTA: String(student.nota),
            OMERITO: String(newMerit),
            FECHAINGRESO: fechaIngresoValida
          });
        });
      });
      // 5. Consolidar ambas listas
      const finalIngresantes = [...directIngresantes, ...adjudicatedIngresantes];
      // 6. Limpiar participantes antiguos de esta modalidad
      const { error: delErr } = await supabase
        .from("participantes")
        .delete()
        .eq("MODALIDAD", activeProcessName)
        .eq("SEMESTRE", semestre)
        .eq("ANIO", anio);
      if (delErr) throw delErr;
      // 7. Insertar todos los ingresantes consolidados en bloques
      if (finalIngresantes.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < finalIngresantes.length; i += chunkSize) {
          const chunk = finalIngresantes.slice(i, i + chunkSize);
          const { error: insErr } = await supabase.from("participantes").insert(chunk);
          if (insErr) throw insErr;
        }
      }
      setMigrateStatus("success");
      setMigrateMessage(`¡Proceso finalizado! Se migraron exitosamente ${finalIngresantes.length} ingresantes oficiales a participantes (${directIngresantes.length} regulares y ${adjudicatedIngresantes.length} adjudicados) con filiales y orden de mérito consecutivo resueltos.`);
      setIsAlreadyMigrated(true);
      fetchData();
    } catch (e: any) {
      setMigrateStatus("error");
      setMigrateMessage("Error en la migración final: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveVacancies = async () => {
    setCsvLoading(true);
    try {
      const toInsert = Object.entries(configVacanciesData)
        .filter(([_, value]) => (value as number) > 0)
        .map(([esc, val]) => ({
          escuela: esc,
          area: configVacanciesArea,
          vacantes_totales: val,
          vacantes_disponibles: val,
          modalidad: activeProcessName,
        }));

      await supabase
        .from("adjudicacion_vacantes")
        .delete()
        .eq("area", configVacanciesArea)
        .eq("modalidad", activeProcessName);

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from("adjudicacion_vacantes")
          .insert(toInsert);
        if (error) {
          if (
            error.code === "42501" ||
            error.message?.includes("security policy")
          ) {
            setDbError("needs_sql");
            setShowConfigVacancies(false);
            return;
          }
          throw error;
        }
      }

      alert("Vacantes guardadas correctamente");
      setShowConfigVacancies(false);
      if (selectedArea === configVacanciesArea) {
        fetchData();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setCsvLoading(false);
    }
  };

  const sqlRequired = `
ALTER TABLE adjudicacion_vacantes ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'CEPRU ORDINARIO 2026-I';
ALTER TABLE adjudicacion_ranking ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'CEPRU ORDINARIO 2026-I';

-- IMPORTANTE: Para permitir guardar registros desde la app:
ALTER TABLE adjudicacion_vacantes DISABLE ROW LEVEL SECURITY;
ALTER TABLE adjudicacion_ranking DISABLE ROW LEVEL SECURITY;

-- Si deseas crearlas de cero:
-- CREATE TABLE adjudicacion_vacantes (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   escuela TEXT NOT NULL,
--   area TEXT NOT NULL,
--   vacantes_totales INT NOT NULL,
--   vacantes_disponibles INT NOT NULL,
--   modalidad TEXT NOT NULL
-- );
-- 
-- CREATE TABLE adjudicacion_ranking (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   orden_merito INT NOT NULL,
--   dni TEXT NOT NULL,
--   nombre TEXT NOT NULL,
--   area TEXT NOT NULL,
--   nota NUMERIC NOT NULL,
--   estado_asistencia BOOLEAN DEFAULT false,
--   escuela_adjudicada TEXT,
--   observacion TEXT,
--   modalidad TEXT NOT NULL
-- );`;

  const handleCreateProcess = async () => {
    if (!selectedModalidadParaNueva) return;

    try {
      // Verificar si ya existen vacantes para esta modalidad en adjudicaciones
      const { data: existing } = await supabase
        .from("adjudicacion_vacantes")
        .select("id")
        .eq("modalidad", selectedModalidadParaNueva)
        .limit(1);

      if (!existing || existing.length === 0) {
        // Guardar el proceso de adjudicación insertando un registro marcador vacío
        const { error: insError } = await supabase
          .from("adjudicacion_vacantes")
          .insert([
            {
              escuela: "— SIN CONFIGURAR —",
              area: "_",
              vacantes_totales: 0,
              vacantes_disponibles: 0,
              modalidad: selectedModalidadParaNueva,
            },
          ]);

        if (insError) {
          if (
            insError.code === "42501" ||
            insError.message?.includes("security policy")
          ) {
            setDbError("needs_sql");
          }
        }
      }
    } catch (e) {
      console.error("Error copiando vacantes", e);
    }

    if (!procesos.includes(selectedModalidadParaNueva)) {
      setProcesos((prev) => [...prev, selectedModalidadParaNueva]);
    }
    setActiveProcessName(selectedModalidadParaNueva);
    setCurrentView("detail");
    setShowCreateModal(false);
  };

  if (currentView === "list") {
    return (
      <div className="max-w-7xl mx-auto space-y-8 pt-8 pb-12">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">
                assignment_turned_in
              </span>
              Procesos de Adjudicación
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              Seleccione una adjudicación existente.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            Cargando procesos...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {procesos.map((p, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setActiveProcessName(p);
                  setCurrentView("detail");
                }}
                className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-all hover:-translate-y-1 group"
              >
                <div className="flex flex-col h-full">
                  <span className="bg-blue-50 text-blue-700 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-lg w-fit mb-4">
                    Adjudicación
                  </span>
                  <h3 className="font-black text-slate-900 text-lg mb-2 group-hover:text-primary transition-colors">
                    {p}
                  </h3>
                  <p className="text-sm font-bold text-slate-400 mt-auto flex items-center justify-between pt-4">
                    Tocar para gestionar
                    <span className="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      arrow_forward
                    </span>
                  </p>
                </div>
              </div>
            ))}
            {procesos.length === 0 && (
              <div className="col-span-full text-center py-20 bg-white border border-slate-200 border-dashed rounded-3xl">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">
                  inbox
                </span>
                <p className="text-slate-500 font-medium">
                  No hay procesos de adjudicación creados aún.
                </p>
              </div>
            )}
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-8 border border-slate-100">
              <h3 className="text-xl font-black text-slate-900 uppercase">
                Nueva Adjudicación
              </h3>
              <p className="text-slate-500 font-medium text-sm mt-1">
                Seleccione el año y la modalidad para inicializar.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                    Año (Cuadro de Vacantes Aprobado)
                  </label>
                  <select
                    value={selectedAnioId}
                    onChange={(e) => setSelectedAnioId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-primary"
                  >
                    <option value="">Seleccione un año...</option>
                    {anios.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.anio}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                    Modalidad
                  </label>
                  <select
                    value={selectedModalidadId}
                    onChange={(e) => setSelectedModalidadId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-primary disabled:opacity-50"
                    disabled={!selectedAnioId || modalidades.length === 0}
                  >
                    <option value="">Seleccione una modalidad...</option>
                    {modalidades.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl font-black text-sm transition-colors flex-[1]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateProcess}
                  disabled={!selectedModalidadId}
                  className="px-6 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-lg shadow-primary/30 disabled:opacity-50 hover:scale-105 transition-all flex-[2]"
                >
                  Crear y Empezar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pt-8 pb-12">
      <div className="flex justify-start mb-2">
        <button
          onClick={() => setCurrentView("list")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">
            arrow_back
          </span>
          Volver a la lista
        </button>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex-1">
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Adjudicación: {activeProcessName}
          </h1>
          <p className="text-sm font-bold text-slate-500 mt-1">
            Gestión de ceremonias de adjudicación y asistencia
          </p>
        </div>
        <div className="flex bg-slate-100 border border-slate-200/50 p-1 rounded-2xl shadow-inner">
          <button
            onClick={() => setActiveTab("adjudication")}
            className={`px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider font-black transition-all flex items-center gap-2 ${activeTab === "adjudication" ? "bg-primary text-white shadow-md scale-[1.01]" : "text-slate-600 hover:text-slate-900"}`}
          >
            <span className="material-symbols-outlined text-[18px]">
              dashboard
            </span>
            Panel Adjudicación
          </button>
          <button
            onClick={() => setActiveTab("attendance")}
            className={`px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider font-black transition-all flex items-center gap-2 ${activeTab === "attendance" ? "bg-primary text-white shadow-md scale-[1.01]" : "text-slate-600 hover:text-slate-900"}`}
          >
            <span className="material-symbols-outlined text-[18px]">
              qr_code_scanner
            </span>
            Escáner Asistencia
          </button>
        </div>
      </div>

      {activeTab === "attendance" && (
        <div className="max-w-md mx-auto space-y-6 pt-4 pb-20">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Registro de Asistencia
            </h2>
            <p className="text-xs font-bold text-slate-500 mt-1">
              Escanea el DNI del postulante en puerta
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div id="reader" className="w-full bg-slate-100"></div>
          </div>

          {attendanceMessage && (
            <div
              className={`p-4 rounded-xl border text-sm ${
                attendanceMessage.type === "success"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : attendanceMessage.type === "error"
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-blue-50 border-blue-200 text-blue-700"
              }`}
            >
              <div className="font-bold text-center">{attendanceMessage.text}</div>

              {/* Warnings display for the scanned/entered student */}
              {attendanceMessage.warnings && (attendanceMessage.warnings.partRecord || attendanceMessage.warnings.resRecord || attendanceMessage.warnings.renRecord) && (
                <div className="mt-4 pt-3 border-t border-slate-250 text-left space-y-2.5 animate-fade-in text-xs">
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2 text-center">
                    ⚠️ ALERTAS DE CRUCE DE DATOS ENCONTRADAS:
                  </p>
                  
                  {attendanceMessage.warnings.partRecord && (
                    <div className="flex gap-2.5 items-start bg-sky-100/60 border border-sky-200 p-3 rounded-xl text-sky-900 shadow-sm">
                      <span className="material-symbols-outlined text-lg leading-none mt-0.5 text-sky-700 font-bold">school</span>
                      <div>
                        <span className="font-extrabold uppercase text-[9px] tracking-wider block text-sky-800">INGRESO PREVIO REGISTRADO</span>
                        <p className="font-semibold mt-0.5 leading-relaxed">
                          Ingresó a <strong className="font-black text-sky-950">{attendanceMessage.warnings.partRecord.CARRERA}</strong> en el semestre <span className="font-black">{attendanceMessage.warnings.partRecord.SEMESTRE || attendanceMessage.warnings.partRecord.ANIO}</span> ({attendanceMessage.warnings.partRecord.MODALIDAD || 'Ordinario'})
                        </p>
                      </div>
                    </div>
                  )}

                  {attendanceMessage.warnings.resRecord && (
                    attendanceMessage.warnings.resRecord.is_withdrawn ? (
                      <div className="flex gap-2.5 items-start bg-amber-100/60 border border-amber-200 p-3 rounded-xl text-amber-900 shadow-sm">
                        <span className="material-symbols-outlined text-lg leading-none mt-0.5 text-amber-700 font-bold">block</span>
                        <div>
                          <span className="font-extrabold uppercase text-[9px] tracking-wider block text-amber-800">RESERVA DE VACANTE ANULADA</span>
                          <p className="font-semibold mt-0.5 leading-relaxed text-amber-950">
                            Tenía reserva registrada pero está <span className="font-black">Anulada por Renuncia</span> (Resolución: {attendanceMessage.warnings.resRecord.withdrawal_resolution_number || 'S/N'}).
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2.5 items-start bg-indigo-100/60 border border-indigo-200 p-3 rounded-xl text-indigo-900 shadow-sm">
                        <span className="material-symbols-outlined text-lg leading-none mt-0.5 text-indigo-700 font-bold">pending_actions</span>
                        <div>
                          <span className="font-extrabold uppercase text-[9px] tracking-wider block text-indigo-800">RESERVA DE VACANTE ACTIVA</span>
                          <p className="font-semibold mt-0.5 leading-relaxed">
                            Reserva de vacante activa para el semestre <span className="font-black">{attendanceMessage.warnings.resRecord.starting_semester || 'S/F'}</span>. Resol: {attendanceMessage.warnings.resRecord.batch?.resolution_number || 'En trámite'} ({attendanceMessage.warnings.resRecord.admission_modality})
                          </p>
                        </div>
                      </div>
                    )
                  )}

                  {attendanceMessage.warnings.renRecord && (
                    <div className="flex gap-2.5 items-start bg-red-100/60 border border-red-200 p-3 rounded-xl text-red-900 shadow-sm">
                      <span className="material-symbols-outlined text-lg leading-none mt-0.5 text-red-700 font-bold">assignment_return</span>
                      <div>
                        <span className="font-extrabold uppercase text-[9px] tracking-wider block text-red-800">TRÁMITE DE RENUNCIA REGISTRADO</span>
                        <p className="font-semibold mt-0.5 leading-relaxed font-sans">
                          Ha tramitado renuncia en <strong className="font-black text-red-950">{attendanceMessage.warnings.renRecord.school}</strong> (Expediente: <span className="font-mono font-bold">{attendanceMessage.warnings.renRecord.expediente_number || '-'}</span>). Estado: <span className="font-black uppercase text-[10px] px-1.5 py-0.5 bg-red-200 text-red-800 rounded">{attendanceMessage.warnings.renRecord.status}</span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="bg-white p-6 flex flex-col gap-4 rounded-3xl border border-slate-200 shadow-sm">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">
              INGRESO MANUAL DE DNI
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={scannedDni}
                onChange={(e) => setScannedDni(e.target.value)}
                placeholder="Ej: 70000000"
                className="flex-1 bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl font-bold text-slate-700 outline-none text-center tracking-widest focus:border-primary"
              />
              <button
                onClick={() => handleRegisterAttendance(scannedDni)}
                className="bg-primary text-white px-6 py-3 rounded-xl font-black uppercase shadow-sm"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "adjudication" &&
        (dbError === "needs_sql" ? (
          <div className="bg-white border border-red-200 rounded-3xl p-8 shadow-sm">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <span className="material-symbols-outlined text-3xl">
                database
              </span>
              <h2 className="text-xl font-black uppercase">
                Faltan Tablas o Permisos (RLS)
              </h2>
            </div>
            <p className="text-slate-600 mb-6 font-medium">
              Debe ejecutar este script en Supabase SQL Editor para crear las
              tablas y desactivar RLS temporalmente.
            </p>
            <pre className="bg-slate-900 text-slate-50 p-6 rounded-xl text-sm font-mono overflow-x-auto shadow-inner">
              {sqlRequired}
            </pre>
            <div className="mt-6 flex justify-end gap-4">
              <button
                onClick={() => fetchData()}
                className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-black text-sm hover:bg-slate-200 transition-colors"
                title="Reintentar Carga"
              >
                Ya lo ejecuté, Recargar
              </button>
            </div>
          </div>
        ) : dbError ? (
          <div className="bg-red-50 text-red-600 p-6 rounded-3xl font-bold">
            Error: {dbError}
          </div>
        ) : (
          <div className="space-y-6">
            {isAlreadyMigrated && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-[24px] p-5 flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl font-black">verified</span>
                </div>
                <div>
                  <h3 className="text-sm font-black text-emerald-950 uppercase tracking-wider">PROCESO FINALIZADO Y MIGRADO</h3>
                  <p className="text-xs font-bold text-emerald-800 leading-normal mt-0.5">
                    Este proceso de adjudicación ha sido aprobado y migrado de forma permanente a la lista oficial de ingresantes/participantes. Toda la información de vacantes y postulantes asignados ha sido congelada.
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex bg-slate-200/60 p-1 rounded-xl w-max self-center lg:self-auto shadow-inner border border-slate-300/30">
                {["A", "B", "C", "D"].map((area) => (
                  <button
                    key={area}
                    onClick={() => setSelectedArea(area)}
                    className={`px-6 py-2 rounded-lg text-sm font-black transition-all ${selectedArea === area ? "bg-primary text-white shadow-md scale-[1.02]" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    Área {area}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 px-2 py-1 flex-1">
                <button
                  onClick={() => setShowCsvModal(true)}
                  disabled={!activeProcessName || csvLoading}
                  className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 hover:border-emerald-300 hover:text-emerald-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none"
                  title="Importar CSV de Ranking de postulantes para adjudicación"
                >
                  <span className="material-symbols-outlined text-[18px] text-emerald-500 font-bold">
                    upload_file
                  </span>
                  Importar CSV
                </button>

                <button
                  onClick={openPizarra}
                  disabled={generatingPdf || !activeProcessName}
                  className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 hover:border-amber-400 hover:text-amber-800 rounded-xl font-black text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none"
                  title="Configurar y descargar pizarra visual actual de vacantes para el público"
                >
                  <span className="material-symbols-outlined text-[18px] text-amber-500 font-bold">
                    tv
                  </span>
                  Pizarra Vacantes
                </button>

                <button
                  onClick={exportOfficialPdfReport}
                  disabled={exportingPdf || !activeProcessName}
                  className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 hover:border-red-400 hover:text-red-800 rounded-xl font-black text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none"
                  title="Descargar Reporte PDF oficial con cuadro de vacantes, cubiertas, diferencia y lista de alumnos"
                >
                  <span className="material-symbols-outlined text-[18px] text-red-600 font-bold">
                    picture_as_pdf
                  </span>
                  {exportingPdf ? "Generando..." : "Detalle PDF"}
                </button>

                <button
                  onClick={exportOfficialExcelReport}
                  disabled={exportingExcel || !activeProcessName}
                  className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 hover:text-emerald-800 rounded-xl font-black text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none"
                  title="Descargar Reporte Excel oficial con datos tabulares de adscripción y vacantes"
                >
                  <span className="material-symbols-outlined text-[18px] text-emerald-600 font-bold">
                    table_chart
                  </span>
                  {exportingExcel ? "Generando..." : "Detalle Excel"}
                </button>

                <button
                  onClick={() => {
                    setConfigVacanciesArea("A");
                    setShowConfigVacancies(true);
                    loadConfigVacancies("A");
                  }}
                  disabled={!activeProcessName}
                  className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 hover:border-blue-300 hover:text-blue-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:pointer-events-none"
                  title="Configurar vacantes de las escuelas profesionales"
                >
                  <span className="material-symbols-outlined text-[18px] text-blue-500 font-bold">
                    settings
                  </span>
                  Configurar Vacantes
                </button>

                <button
                  onClick={() => setIsMaximized(true)}
                  disabled={!activeProcessName || ranking.length === 0}
                  className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 shadow-md shadow-indigo-600/15 disabled:opacity-40 disabled:pointer-events-none"
                  title="Maximizar en Modo Ceremonia"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    fullscreen
                  </span>
                  Maximizar (MC)
                </button>
                {isAlreadyMigrated ? (
                  <button
                    disabled={true}
                    className="px-4 py-2.5 bg-slate-100 text-slate-400 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-wide flex items-center gap-1.5 cursor-not-allowed"
                    title="Este proceso ya ha sido finalizado de forma permanente."
                  >
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                    Proceso Finalizado
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMigrateDate(new Date().toISOString().split("T")[0]);
                      setMigrateStatus("idle");
                      setMigrateMessage("");
                      setShowMigrateModal(true);
                    }}
                    disabled={!activeProcessName || isSaving}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5 shadow-md disabled:opacity-40 disabled:pointer-events-none"
                    title="Finalizar el proceso y migrar la lista consolidada de ingresantes oficiales a participantes"
                  >
                    {isSaving ? (
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">fact_check</span>
                    )}
                    Aprobar y Migrar
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[700px]">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-lg font-black text-slate-900">
                    Ranking Postulantes (Área {selectedArea})
                  </h2>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-400 hidden xl:inline">
                      Use flechas ◀ ▶ del teclado para navegar
                    </span>
                    {ranking.length === 0 && !loading && (
                      <button
                        onClick={initTestData}
                        disabled={!activeProcessName}
                        className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-black uppercase hover:bg-slate-200 transition-colors disabled:opacity-50"
                      >
                        Generar Prueba
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-6 bg-slate-50/20">
                  {loading ? (
                    <div className="text-center p-10 text-slate-400 font-bold">
                      Cargando...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ranking.map((student, idx) => {
                        const partRecord = crossRefs.participantes[student.dni?.trim()];
                        const resRecord = crossRefs.reservas[student.dni?.trim()];
                        const renRecord = crossRefs.renuncias[student.dni?.trim()];

                        return (
                          <div
                            key={student.id}
                            ref={(el) => { cardRefs.current[idx] = el; }}
                            onClick={() => setSelectedRankIndex(idx)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                              idx === selectedRankIndex
                                ? "border-purple-500 bg-purple-50/40 shadow-xl ring-2 ring-purple-500/25 scale-[1.01]"
                                : "border-slate-200 bg-white hover:bg-slate-50 hover:shadow-md"
                            }`}
                          >
                            <div className={`size-12 rounded-full flex items-center justify-center font-black text-lg transition-colors ${
                              idx === selectedRankIndex
                                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                                : "bg-slate-200 text-slate-500"
                            }`}>
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-black text-slate-900 text-base truncate" title={student.nombre}>
                                {student.nombre}
                              </h3>
                              <p className="text-xs font-bold text-slate-500 mt-0.5 animate-fade-in">
                                DNI: {student.dni} • NOTA: {student.nota}
                              </p>

                              {/* Cross-reference Warning Badges */}
                              {(partRecord || resRecord || renRecord) && (
                                <div className="flex flex-wrap gap-1 mt-1.5 relative">
                                  {partRecord && (
                                    <span 
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-black rounded-md uppercase border border-sky-100 shadow-sm whitespace-nowrap cursor-help relative group"
                                    >
                                      <span className="material-symbols-outlined text-[12px] font-bold">school</span>
                                      Ingreso ({partRecord.SEMESTRE || partRecord.ANIO})

                                      {/* Custom floating tooltip balloon */}
                                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-[300px] bg-slate-950 border border-slate-800 text-slate-200 p-3 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-[100] text-xs normal-case font-normal leading-relaxed">
                                        <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5 mb-1.5 font-bold text-white uppercase text-[10px] tracking-wider text-sky-400">
                                          <span className="material-symbols-outlined text-sm font-black">school</span>
                                          Detalle de Ingreso Registrado
                                        </div>
                                        <div className="space-y-1 text-[11px]">
                                          <div>
                                            <span className="text-slate-400 font-semibold block">Escuela:</span>
                                            <span className="text-white font-bold">{partRecord.CARRERA || 'No especificada'}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 font-semibold block">Modalidad:</span>
                                            <span className="text-slate-200">{partRecord.MODALIDAD || 'No especificada'}</span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-white/5 text-[10px]">
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Semestre:</span>
                                              <span className="text-white font-bold">{partRecord.SEMESTRE || partRecord.ANIO || '-'}</span>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Nota / Mérito:</span>
                                              <span className="text-white font-bold">{partRecord.NOTA || '-'} (Pto. {partRecord.OMERITO || '-'})</span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-950"></div>
                                      </div>
                                    </span>
                                  )}
                                  {resRecord && (
                                    resRecord.is_withdrawn ? (
                                      <span 
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-black rounded-md uppercase border border-amber-100 shadow-sm whitespace-nowrap cursor-help relative group"
                                      >
                                        <span className="material-symbols-outlined text-[12px] font-bold">block</span>
                                        Reserva Anulada

                                        {/* Custom floating tooltip balloon */}
                                        <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-[300px] bg-slate-950 border border-slate-800 text-slate-200 p-3 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-[100] text-xs normal-case font-normal leading-relaxed">
                                          <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5 mb-1.5 font-bold text-white uppercase text-[10px] tracking-wider text-amber-500">
                                            <span className="material-symbols-outlined text-sm font-black">block</span>
                                            Reserva Anulada / Renuncia
                                          </div>
                                          <div className="space-y-1 text-[11px]">
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Observación:</span>
                                              <span className="text-amber-400 font-bold">Anulada por trámite de renuncia registrado</span>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Res. Renuncia:</span>
                                              <span className="text-white font-bold">{resRecord.withdrawal_resolution_number || 'S/N'}</span>
                                            </div>
                                            {resRecord.withdrawal_resolution_date && (
                                              <div>
                                                <span className="text-slate-400 font-semibold block">Fecha de Resolución:</span>
                                                <span className="text-slate-200">{resRecord.withdrawal_resolution_date}</span>
                                              </div>
                                            )}
                                          </div>
                                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-950"></div>
                                        </div>
                                      </span>
                                    ) : (
                                      <span 
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-md uppercase border border-indigo-100 shadow-sm whitespace-nowrap cursor-help relative group"
                                      >
                                        <span className="material-symbols-outlined text-[12px] font-bold">pending_actions</span>
                                        Reserva Vacante

                                        {/* Custom floating tooltip balloon */}
                                        <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-[300px] bg-slate-950 border border-slate-800 text-slate-200 p-3 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-[100] text-xs normal-case font-normal leading-relaxed">
                                          <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5 mb-1.5 font-bold text-white uppercase text-[10px] tracking-wider text-indigo-400">
                                            <span className="material-symbols-outlined text-sm font-black">pending_actions</span>
                                            Reserva de Vacante Activa
                                          </div>
                                          <div className="space-y-1 text-[11px]">
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Modalidad de Ingreso:</span>
                                              <span className="text-slate-150 font-medium">{resRecord.admission_modality || 'No especificada'}</span>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Nº Resolución de Reserva:</span>
                                              <span className="text-white font-bold">{resRecord.batch?.resolution_number || 'Constancia en trámite'}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-white/5 text-[10px]">
                                              <div>
                                                <span className="text-slate-400 font-semibold block">Año de Reserva:</span>
                                                <span className="text-white font-bold">{resRecord.grade_level || '-'}</span>
                                              </div>
                                              <div>
                                                <span className="text-slate-400 font-semibold block">Semestre de Inicio:</span>
                                                <span className="text-white font-bold">{resRecord.starting_semester || '-'}</span>
                                              </div>
                                            </div>
                                          </div>
                                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-950"></div>
                                        </div>
                                      </span>
                                    )
                                  )}
                                  {renRecord && (
                                    <span 
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-black rounded-md uppercase border border-red-100 shadow-sm whitespace-nowrap cursor-help relative group"
                                    >
                                      <span className="material-symbols-outlined text-[12px] font-bold">assignment_return</span>
                                      Renuncia ({renRecord.status || 'Pendiente'})

                                      {/* Custom floating tooltip balloon */}
                                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-[300px] bg-slate-950 border border-slate-800 text-slate-200 p-3 rounded-xl shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 z-[100] text-xs normal-case font-normal leading-relaxed">
                                        <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5 mb-1.5 font-bold text-white uppercase text-[10px] tracking-wider text-red-400">
                                          <span className="material-symbols-outlined text-sm font-black">assignment_return</span>
                                          Trámite de Renuncia Registrado
                                        </div>
                                        <div className="space-y-1 text-[11px]">
                                          <div>
                                            <span className="text-slate-400 font-semibold block">Escuela del Trámite:</span>
                                            <span className="text-white font-bold">{renRecord.school || 'No especificada'}</span>
                                          </div>
                                          <div>
                                            <span className="text-slate-400 font-semibold block">Expediente de Trámite:</span>
                                            <span className="text-slate-200 font-mono font-bold text-[10px]">{renRecord.expediente_number || 'No registrado'}</span>
                                          </div>
                                          <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-white/5 text-[10px]">
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Estado del Trámite:</span>
                                              <span className="text-red-400 font-black uppercase text-[10px] bg-red-950/40 border border-red-900/40 px-1.5 py-0.5 rounded inline-block">{renRecord.status || 'Pendiente'}</span>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 font-semibold block">Semestre de Ingreso:</span>
                                              <span className="text-white font-bold font-mono text-[10px]">{renRecord.semester || '-'}</span>
                                            </div>
                                          </div>
                                        </div>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-slate-950"></div>
                                      </div>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-center justify-center min-w-[100px]">
                              {student.estado_asistencia ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-[10px] font-black rounded-lg uppercase border border-green-200 animate-pulse">
                                  <span className="size-1.5 rounded-full bg-green-500" />
                                  Presente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-slate-200 text-slate-500 text-[10px] font-black rounded-lg uppercase">
                                  <span className="size-1.5 rounded-full bg-slate-400" />
                                  Ausente
                                </span>
                              )}
                            </div>
                            <div>
                              {student.escuela_adjudicada ? (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdjudicateClick(student);
                                  }}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    handleAdjudicateClick(student);
                                  }}
                                  className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-right transition-all select-none relative group cursor-default"
                                >
                                  {/* Discreet tiny indicator visible only on hover */}
                                  <span className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  <div>
                                    <div className="text-slate-500 text-[10px] font-black uppercase">
                                      Adjudicado
                                    </div>
                                    <div className="text-slate-800 font-bold text-xs truncate max-w-[124px]">
                                      {student.escuela_adjudicada}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAdjudicateClick(student);
                                  }}
                                  disabled={!student.estado_asistencia}
                                  className={`px-5 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${
                                    student.estado_asistencia
                                      ? "bg-primary text-white shadow-lg shadow-primary/30 hover:scale-105"
                                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                                  }`}
                                >
                                  Adjudicar
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {ranking.length === 0 && (
                        <div className="text-center text-slate-400 py-10 font-bold">
                          No hay postulantes.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Vacancies Dashboard (1/3 width) */}
              <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[700px]">
                <div className="p-6 border-b border-slate-100 bg-slate-50">
                  <h2 className="text-lg font-black text-slate-900">
                    Vacantes (Área {selectedArea})
                  </h2>
                </div>
                <div className="overflow-y-auto p-6 space-y-4">
                  {vacancies.map((v) => (
                    <div
                      key={v.id}
                      className="p-4 rounded-xl border border-slate-200 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <h4 className="font-black text-slate-800 text-sm">
                          {v.escuela}
                        </h4>
                        <div className="w-full bg-slate-100 h-2 mt-3 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${v.vacantes_disponibles > 0 ? "bg-primary" : "bg-red-500"}`}
                            style={{
                              width: `${v.vacantes_totales === 0 ? 0 : (v.vacantes_disponibles / v.vacantes_totales) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <span
                          className={`text-2xl font-black ${v.vacantes_disponibles > 0 ? "text-primary" : "text-red-500"}`}
                        >
                          {v.vacantes_disponibles}
                        </span>
                        <span className="text-slate-400 font-bold block text-[10px] uppercase mt-[-4px]">
                          Disp.
                        </span>
                      </div>
                    </div>
                  ))}
                  {vacancies.length === 0 && !loading && (
                    <div className="text-center text-slate-400 py-10 font-bold">
                      No hay vacantes configuradas.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

      {/* Adjudication Modal */}
      {showModal && selectedStudent && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md transition-all animate-fade-in">
          <div className="bg-white rounded-[32px] max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header & Student Spotlight Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-8 py-6 text-white shrink-0 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.15),transparent_45%)]" />
              
              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">
                    Proceso Oficial de Adjudicación
                  </span>
                  <h3 className="text-2xl font-black tracking-tight uppercase text-white mt-1">
                    {selectedStudent.nombre}
                  </h3>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold border border-white/5">
                      DNI: {selectedStudent.dni}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/10 rounded-lg text-xs font-bold border border-white/5">
                      Puntaje: {selectedStudent.nota}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center px-4 py-2 bg-indigo-600/30 border border-indigo-505/30 rounded-2xl text-center min-w-[100px] sm:self-center">
                  <span className="text-[9px] font-black uppercase text-indigo-300 tracking-widest leading-none">Mérito</span>
                  <span className="text-2xl font-black mt-1 text-white">N° {selectedStudent.orden_merito}</span>
                </div>
              </div>
            </div>

            {(() => {
              const partRec = crossRefs.participantes[selectedStudent.dni?.trim()];
              const resRec = crossRefs.reservas[selectedStudent.dni?.trim()];
              const renRec = crossRefs.renuncias[selectedStudent.dni?.trim()];
              
              const filteredSchools = vacancies
                .filter((v) => v.vacantes_disponibles > 0 || v.escuela === selectedStudent.escuela_adjudicada)
                .filter((v) => !schoolSearch.trim() || v.escuela.toLowerCase().includes(schoolSearch.toLowerCase().trim()));

              return (
                <div className="p-8 flex flex-col gap-6 overflow-hidden flex-1">
                  
                  {/* Real-time Cross-reference Alerts inside Adjudication Card */}
                  {(partRec || resRec || renRec) && (
                    <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col gap-2 shrink-0 animate-fade-in">
                      <div className="text-[9px] font-black uppercase text-slate-505 tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">warning</span>
                        Alertas y Restricciones de Postulante
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        {partRec && (
                          <div className="flex gap-2 items-start bg-sky-50 border border-sky-100 p-2.5 rounded-xl text-sky-905 text-xs">
                            <span className="material-symbols-outlined text-base text-sky-600 font-bold mt-0.5">school</span>
                            <div>
                              <span className="font-extrabold text-[8px] uppercase tracking-wider block text-sky-700">INGRESO PREVIO</span>
                              <p className="font-semibold leading-tight text-[11px] mt-0.5 text-sky-950">
                                {partRec.CARRERA} ({partRec.SEMESTRE || partRec.ANIO})
                              </p>
                            </div>
                          </div>
                        )}
                        {resRec && (
                          <div className="flex gap-2 items-start bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl text-indigo-905 text-xs">
                            <span className="material-symbols-outlined text-base text-indigo-600 font-bold mt-0.5">pending_actions</span>
                            <div>
                              <span className="font-extrabold text-[8px] uppercase tracking-wider block text-indigo-700">
                                {resRec.is_withdrawn ? "RESERVA ANULADA" : "RESERVA ACTIVA"}
                              </span>
                              <p className="font-semibold leading-tight text-[11px] mt-0.5 text-indigo-950">
                                Semestre: {resRec.starting_semester || 'S/S'} {resRec.is_withdrawn ? '(Anulada)' : ''}
                              </p>
                            </div>
                          </div>
                        )}
                        {renRec && (
                          <div className="flex gap-2 items-start bg-red-50 border border-red-105 p-2.5 rounded-xl text-red-905 text-xs col-span-1 sm:col-span-2">
                            <span className="material-symbols-outlined text-base text-red-600 font-bold mt-0.5">assignment_return</span>
                            <div>
                              <span className="font-extrabold text-[8px] uppercase tracking-wider block text-red-700">RENUNCIA DETECTADA</span>
                              <p className="font-semibold leading-tight text-[11px] mt-0.5 text-red-955">
                                Trámite de renuncia registrado en <strong className="font-bold">{renRec.school}</strong> (Est: {renRec.status})
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Filter & Search Dashboard Controls */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">
                        Seleccionar Escuela de Destino
                      </label>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        {filteredSchools.length} de {vacancies.filter(v => v.vacantes_disponibles > 0 || v.escuela === selectedStudent.escuela_adjudicada).length} escuelas
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined text-slate-400 absolute left-4 text-xl">
                        search
                      </span>
                      <input
                        ref={schoolSearchRef}
                        type="text"
                        value={schoolSearch}
                        onChange={(e) => setSchoolSearch(e.target.value)}
                        placeholder="Escriba escuela profesional (Ej: Medicina, Sistemas...)"
                        className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-2xl pl-12 pr-10 py-3.5 font-bold text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-indigo-650 focus:bg-white focus:ring-4 focus:ring-indigo-600/5 text-sm"
                      />
                      {schoolSearch && (
                        <button
                          onClick={() => setSchoolSearch("")}
                          className="absolute right-4 p-1 hover:bg-slate-200 rounded-full transition-colors flex items-center justify-center text-slate-400 hover:text-slate-600"
                        >
                          <span className="material-symbols-outlined text-sm font-black">close</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* School interactive grid */}
                  <div className="flex-1 overflow-y-auto px-1 pr-2 min-h-[220px] max-h-[380px] space-y-3 scrollbar-thin">
                    {filteredSchools.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {filteredSchools.map((v) => {
                          const isSelected = selectedSchool === v.escuela;
                          const isActual = v.escuela === selectedStudent.escuela_adjudicada;
                          const count = v.vacantes_disponibles;

                          // Color and warning styles based on remaining vacancies count
                          let capsuleStyles = "bg-green-50 text-green-700 border-green-200/60";
                          let dotColor = "bg-green-500 shadow-md shadow-green-500/20";
                          let countText = `${count} Vacantes`;

                          if (count === 1) {
                            capsuleStyles = "bg-red-50 text-red-700 border-red-200/60 animate-pulse font-black";
                            dotColor = "bg-red-500 shadow-md shadow-red-500/40";
                            countText = "ÚLTIMA VACANTE!";
                          } else if (count <= 5) {
                            capsuleStyles = "bg-amber-50 text-amber-700 border-amber-200/60 font-extrabold";
                            dotColor = "bg-amber-500 shadow-md shadow-amber-500/25";
                            countText = `${count} Vacantes`;
                          }

                          return (
                            <div
                              key={v.id}
                              onClick={() => setSelectedSchool(v.escuela)}
                              onDoubleClick={() => {
                                setSelectedSchool(v.escuela);
                                setTimeout(() => confirmAdjudication(), 30);
                              }}
                              className={`p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer select-none relative overflow-hidden flex flex-col justify-between gap-3 group hover:scale-[1.015] active:scale-[0.99] ${
                                isSelected
                                  ? "border-indigo-600 bg-indigo-50/40 shadow-xl shadow-indigo-600/5 ring-1 ring-indigo-600/30"
                                  : isActual
                                    ? "border-purple-200 bg-purple-50/20"
                                    : "border-slate-100 bg-white hover:border-slate-250 hover:bg-slate-50/50 hover:shadow-md"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <span className={`text-xs font-black uppercase tracking-tight leading-snug ${isSelected ? 'text-indigo-950 font-black' : 'text-slate-800 font-extrabold'}`}>
                                  {v.escuela}
                                </span>
                                {isSelected ? (
                                  <span className="material-symbols-outlined text-indigo-600 text-[20px] font-black shrink-0 animate-scale-in">
                                    check_circle
                                  </span>
                                ) : (
                                  <span className="size-5 rounded-full border-2 border-slate-200 group-hover:border-slate-300 transition-colors shrink-0" />
                                )}
                              </div>

                              <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100/70 text-[10px] font-black">
                                {isActual ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-pink-100 border border-pink-200 text-pink-700 uppercase tracking-wider text-[9px]">
                                    ✓ Adjudicado a éste
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg uppercase tracking-wider text-[9px] border ${capsuleStyles}`}>
                                    <span className={`size-1.5 rounded-full ${dotColor}`} />
                                    {countText}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                        <span className="material-symbols-outlined text-3xl">school</span>
                        <p className="text-xs font-bold text-center px-4">
                          No se encontraron escuelas con vacantes disponibles que coincidan con &quot;{schoolSearch}&quot;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Keyboard Instruction Footer inside the Modal */}
                  <div className="text-[10px] text-slate-400 font-bold border-t border-slate-100 pt-3 flex items-center justify-center gap-4">
                    <span className="flex items-center gap-1">
                      <span className="bg-slate-105 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[9px] font-black">2-clic</span>
                      Adjudicar Al Instante
                    </span>
                    <span className="text-slate-200">•</span>
                    <span className="flex items-center gap-1">
                      <span className="bg-slate-105 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-[9px] font-black">⏎ Enter</span>
                      Confirmar Adjudicación
                    </span>
                  </div>

                  {/* Actions Drawer Panel */}
                  <div className="flex flex-col gap-3 mt-4 shrink-0 sm:flex-row-reverse sm:gap-4 border-t border-slate-100 pt-5">
                    <button
                      onClick={confirmAdjudication}
                      disabled={!selectedSchool}
                      className="px-6 py-3.5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/30 disabled:opacity-40 disabled:pointer-events-none hover:bg-primary/95 transition-all text-center sm:flex-[2] flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-sm">how_to_reg</span>
                      Confirmar Adjudicación
                    </button>
                    <button
                      onClick={() => setShowModal(false)}
                      className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 rounded-2xl font-black text-xs uppercase tracking-wider transition-all text-center sm:flex-[1]"
                    >
                      Cancelar
                    </button>
                  </div>

                  {selectedStudent.escuela_adjudicada && (
                    <div className="pt-3 border-t border-slate-100 shrink-0">
                      <button
                        onClick={cancelAdjudication}
                        className="w-full py-3 bg-red-50 hover:bg-red-105 text-red-600 hover:text-red-700 text-xs font-black rounded-2xl uppercase transition-all flex items-center justify-center gap-2 border border-red-150/50"
                      >
                        <span className="material-symbols-outlined text-sm">cancel</span>
                        Anular y Liberar Vacante Adjudicada
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-8 border border-slate-100 relative">
            <h3 className="text-xl font-black text-slate-900 uppercase">
              Importar Ranking CSV
            </h3>
            <p className="text-sm font-bold text-slate-500 mt-1">
              Modalidad:{" "}
              <span className="text-primary">{activeProcessName}</span>
            </p>

            <div className="mt-4 p-4 rounded-xl bg-orange-50 border border-orange-100 text-orange-800 text-xs font-medium">
              <p className="font-bold mb-2 uppercase tracking-widest text-[10px]">
                Estructura requerida en la cabecera (1ra fila):
              </p>
              <code className="block bg-orange-100 p-2 rounded-lg font-mono">
                orden_merito, dni, nombre, area, nota
              </code>
            </div>

            <div className="mt-6">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                Archivo CSV
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) =>
                  setCsvFile(e.target.files ? e.target.files[0] : null)
                }
                className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-3 file:px-4
                    file:rounded-xl file:border-0
                    file:text-xs file:font-black file:uppercase file:tracking-widest
                    file:bg-primary file:text-white
                    hover:file:bg-primary/90 file:cursor-pointer"
              />
            </div>

            {csvMessage && (
              <div
                className={`mt-4 p-4 rounded-xl border font-bold text-xs ${csvMessage.type === "success" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}
              >
                {csvMessage.text}
              </div>
            )}

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => {
                  setShowCsvModal(false);
                  setCsvFile(null);
                  setCsvMessage(null);
                }}
                className="px-6 py-3 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl font-black text-sm transition-colors flex-[1]"
              >
                Cancelar
              </button>
              <button
                onClick={handleCsvUpload}
                disabled={!csvFile || csvLoading}
                className="px-6 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-lg shadow-primary/30 disabled:opacity-50 hover:scale-105 transition-all flex-[2] flex justify-center items-center"
              >
                {csvLoading ? (
                  <span className="material-symbols-outlined animate-spin">
                    progress_activity
                  </span>
                ) : (
                  "Subir CSV"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config Vacancies Modal */}
      {showConfigVacancies && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl p-8 border border-slate-100 relative max-h-[90vh] flex flex-col">
            <h3 className="text-xl font-black text-slate-900 uppercase">
              Configurar Vacantes
            </h3>
            <p className="text-sm font-bold text-slate-500 mt-1">
              Se guardarán en:{" "}
              <span className="text-primary">{activeProcessName}</span>
            </p>

            <div className="mt-6 flex bg-slate-100 p-1 rounded-xl w-max mb-6">
              {["A", "B", "C", "D"].map((area) => (
                <button
                  key={area}
                  onClick={() => {
                    setConfigVacanciesArea(area);
                    loadConfigVacancies(area);
                  }}
                  className={`px-6 py-2 rounded-lg text-sm font-black transition-colors ${configVacanciesArea === area ? "bg-primary text-white shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                >
                  Área {area}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {(dynamicSchools[
                configVacanciesArea as keyof typeof dynamicSchools
              ] || []).map((escuela) => (
                <div
                  key={escuela}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="font-bold text-sm text-slate-700">
                    {escuela}
                  </span>
                  <input
                    type="number"
                    min="0"
                    className="w-20 bg-white border border-slate-300 rounded-lg py-2 px-3 text-center text-sm font-black text-slate-900 outline-none focus:border-primary"
                    placeholder="0"
                    value={configVacanciesData[escuela] || ""}
                    onChange={(e) =>
                      setConfigVacanciesData({
                        ...configVacanciesData,
                        [escuela]: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              ))}
              {(dynamicSchools[
                configVacanciesArea as keyof typeof dynamicSchools
              ] || []).length === 0 && (
                <div className="text-center py-8 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-slate-400 font-bold text-xs p-4">
                  No hay escuelas profesionales vigentes para el Área {configVacanciesArea} en este Cuadro de Vacantes Aprobado.
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowConfigVacancies(false)}
                className="px-6 py-3 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl font-black text-sm transition-colors flex-[1]"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveVacancies}
                disabled={csvLoading}
                className="px-6 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-lg shadow-primary/30 disabled:opacity-50 hover:scale-105 transition-all flex-[2] flex justify-center items-center"
              >
                {csvLoading ? (
                  <span className="material-symbols-outlined animate-spin">
                    progress_activity
                  </span>
                ) : (
                  "Guardar Vacantes (" + configVacanciesArea + ")"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMigrateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl p-8 border border-slate-100 flex flex-col items-center">
            {migrateStatus === "idle" && (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-3xl font-black">fact_check</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase text-center">
                  Aprobar y Migrar
                </h3>
                <p className="text-slate-500 font-medium text-sm mt-2 text-center">
                  ¿Confirmar finalización y migrar todos los ingresantes oficiales del proceso <strong className="font-black text-slate-700">"{activeProcessName}"</strong> a participantes?
                </p>
                <div className="w-full mt-6">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                    Fecha Oficial de Ingreso
                  </label>
                  <input
                    type="date"
                    value={migrateDate}
                    onChange={(e) => setMigrateDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-primary"
                  />
                </div>
                <div className="flex gap-4 w-full mt-8">
                  <button
                    onClick={() => setShowMigrateModal(false)}
                    className="px-6 py-3 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl font-black text-sm transition-colors flex-[1]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleApproveAndMigrate}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm shadow-lg shadow-emerald-600/30 transition-all flex-[2]"
                  >
                    Confirmar y Migrar
                  </button>
                </div>
              </>
            )}
            {migrateStatus === "saving" && (
              <div className="py-10 flex flex-col items-center">
                <div className="material-symbols-outlined animate-spin text-5xl text-emerald-600 mb-6">
                  progress_activity
                </div>
                <h3 className="text-lg font-black text-slate-900 uppercase text-center">
                  Migrando ingresantes
                </h3>
                <p className="text-slate-500 font-medium text-sm mt-2 text-center">
                  Procesando registros de asistencia, CSV de pre-revisión y adjudicaciones...
                </p>
              </div>
            )}
            {migrateStatus === "success" && (
              <>
                <div className="w-16 h-16 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-3xl font-black">check_circle</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase text-center">
                  ¡Migración Exitosa!
                </h3>
                <p className="text-slate-650 font-semibold text-sm mt-3 text-center px-2 leading-relaxed">
                  {migrateMessage}
                </p>
                <button
                  onClick={() => setShowMigrateModal(false)}
                  className="w-full mt-8 px-6 py-3.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-black text-sm transition-all"
                >
                  Aceptar
                </button>
              </>
            )}
            {migrateStatus === "error" && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-3xl font-black">error</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 uppercase text-center">
                  Error en la Migración
                </h3>
                <p className="text-red-650 font-semibold text-sm mt-3 text-center px-2 leading-relaxed">
                  {migrateMessage}
                </p>
                <div className="flex gap-4 w-full mt-8">
                  <button
                    onClick={() => setShowMigrateModal(false)}
                    className="px-6 py-3.5 bg-slate-100 text-slate-500 hover:text-slate-700 rounded-xl font-black text-sm transition-colors flex-[1]"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={handleApproveAndMigrate}
                    className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-sm shadow-lg shadow-red-600/30 transition-all flex-[2]"
                  >
                    Reintentar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MC Fullscreen / Maximized Mode Overlay */}
      {isMaximized && (
        <div className="fixed inset-0 z-[200] bg-slate-50 text-slate-900 flex flex-col p-6 overflow-hidden select-none">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6 shrink-0">
            <div className="flex items-center gap-4">
              <span className="px-3.5 py-1.5 bg-primary/10 text-primary border border-primary/20 text-xs font-black rounded-xl uppercase tracking-widest animate-pulse flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary animate-ping" />
                Doble Pantalla / Modo MC
              </span>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">
                {activeProcessName} — AREA {selectedArea}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-xs text-slate-500 font-bold hidden md:block leading-relaxed">
                <div>Ayuda: Flechas <span className="text-primary font-black px-1.5 py-0.5 bg-slate-200 rounded border border-slate-300">◀ Derecha/Izquierda ▶</span> para navegar en el ranking</div>
                <div>Y presione <span className="text-primary font-black px-1.5 py-0.5 bg-slate-200 rounded border border-slate-300">⏎ Enter</span> para Adjudicar</div>
              </div>
              <button
                onClick={() => setIsMaximized(false)}
                className="p-3 bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-2xl transition-all border border-slate-200 flex items-center justify-center shadow-md hover:-translate-y-0.5"
                title="Salir de Pantalla Completa"
              >
                <span className="material-symbols-outlined text-2xl font-bold">close_fullscreen</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
            {/* Left Portion (8/12): Main student spotlight & Ranking list */}
            <div className="lg:col-span-8 flex flex-col h-full overflow-hidden gap-6">
              
              {/* STUDENT SPOTLIGHT PANEL */}
              {ranking[selectedRankIndex] ? (
                (() => {
                  const activeStudent = ranking[selectedRankIndex];
                  return (
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center gap-6 bg-gradient-to-br from-white to-slate-50/50">
                      {/* Ambient background glows */}
                      <div className="absolute top-0 right-0 w-36 h-36 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                      
                      {/* Big Circle with Merit Order */}
                      <div className="size-28 rounded-3xl bg-primary/5 border-2 border-primary/40 text-primary flex flex-col items-center justify-center font-black shadow-md shrink-0">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-primary/75">Mérito</span>
                        <span className="text-4xl leading-none mt-1.5 font-black text-primary">N° {activeStudent.orden_merito}</span>
                      </div>

                      <div className="flex-1 text-center md:text-left">
                        <span className="text-xs font-black tracking-widest uppercase text-slate-400 block mb-1">
                          Postulante en Selección Activa
                        </span>
                        <h2 className="text-3xl md:text-4xl font-black text-slate-900 uppercase tracking-tight leading-tight drop-shadow-sm font-sans">
                          {activeStudent.nombre}
                        </h2>
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 mt-4 text-slate-700 font-bold text-base bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 w-fit">
                          <span>DNI: {activeStudent.dni}</span>
                          <span className="text-slate-300">•</span>
                          <span>Nota: {activeStudent.nota}</span>
                        </div>
                      </div>

                      {/* Status and Action controls widget */}
                      <div className="flex flex-col items-center gap-4 shrink-0 bg-slate-50 p-5 rounded-3xl border border-slate-200 min-w-[210px] shadow-sm">
                        <div className="text-center w-full">
                          <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest block mb-1">Asistencia Escaneada</div>
                          {activeStudent.estado_asistencia ? (
                            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-50 border border-green-200 text-green-700 font-black text-xs rounded-xl uppercase tracking-widest animate-pulse">
                              <span className="size-2 rounded-full bg-green-500 shadow-md shadow-green-500/50" />
                              PRESENTE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 border border-slate-200 text-slate-400 font-black text-xs rounded-xl uppercase tracking-widest">
                              <span className="size-2 rounded-full bg-slate-300" />
                              AUSENTE
                            </span>
                          )}
                        </div>

                        <div className="w-full border-t border-slate-200 my-0.5" />

                        {activeStudent.escuela_adjudicada ? (
                          <div
                            onClick={() => handleAdjudicateClick(activeStudent)}
                            onDoubleClick={() => handleAdjudicateClick(activeStudent)}
                            className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl text-center w-full relative group cursor-default select-none hover:bg-slate-100/40 transition-colors"
                          >
                            {/* Discrete tiny gear symbol visible on hover to guide operators */}
                            <span className="absolute top-2 right-2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="material-symbols-outlined text-[12px] font-bold">settings</span>
                            </span>
                            <div>
                              <div className="text-slate-500 text-[10px] font-black uppercase tracking-wider">ADJUDICÓ VACANTE</div>
                              <div className="text-slate-800 font-extrabold text-sm truncate max-w-[180px] mt-1 leading-tight">
                                {activeStudent.escuela_adjudicada}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAdjudicateClick(activeStudent)}
                            disabled={!activeStudent.estado_asistencia}
                            className={`w-full py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 ${
                              activeStudent.estado_asistencia
                                ? "bg-primary text-white hover:bg-primary/95 hover:scale-[1.03] shadow-lg shadow-primary/30"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm">how_to_reg</span>
                            ADJUDICAR
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center text-slate-500 font-bold shadow-sm">
                  Ningún postulante seleccionado.
                </div>
              )}

              {/* LIVE SEARCHABLE/SCROLLABLE RANKING LIST */}
              <div className="flex-1 bg-white border border-slate-200 rounded-3xl flex flex-col overflow-hidden shadow-lg">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-500">group</span>
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                      Lista General de Orden de Merito ({ranking.length} postulantes)
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedRankIndex((prev) => Math.max(0, prev - 1));
                      }}
                      disabled={selectedRankIndex <= 0}
                      className="p-2 bg-white hover:bg-slate-50 disabled:opacity-30 border border-slate-200 text-slate-600 rounded-xl transition-colors flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-sm font-black">arrow_upward</span>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedRankIndex((prev) => Math.min(ranking.length - 1, prev + 1));
                      }}
                      disabled={selectedRankIndex >= ranking.length - 1}
                      className="p-2 bg-white hover:bg-slate-50 disabled:opacity-30 border border-slate-200 text-slate-600 rounded-xl transition-colors flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-sm font-black">arrow_downward</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/45">
                  {ranking.map((student, idx) => (
                    <div
                      key={student.id}
                      ref={(el) => { cardRefs.current[idx] = el; }}
                      onClick={() => setSelectedRankIndex(idx)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                        idx === selectedRankIndex
                          ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20 scale-[1.005]"
                          : "bg-white border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`size-10 rounded-xl flex items-center justify-center font-black ${
                          idx === selectedRankIndex
                            ? "bg-primary text-white shadow-lg"
                            : "bg-slate-100 border border-slate-250 text-slate-500"
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-black uppercase text-sm truncate ${
                              idx === selectedRankIndex ? "text-primary" : "text-slate-800"
                            }`}>
                              {student.nombre}
                            </span>
                            {student.estado_asistencia && (
                              <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-md uppercase font-black leading-none shrink-0 animate-pulse">
                                Presente
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-bold">
                            DNI: {student.dni} • Nota: {student.nota}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {student.escuela_adjudicada ? (
                          <span className="inline-block text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl uppercase tracking-widest shadow-sm">
                            Adjudicado: {student.escuela_adjudicada}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-450">
                            Esp. Adjudicación
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {ranking.length === 0 && (
                    <div className="text-center text-slate-400 py-12 font-bold">
                      No hay postulantes.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Portion (4/12): Live Vacancy Panel */}
            <div className="lg:col-span-4 flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-lg">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
                <span className="material-symbols-outlined text-slate-500">equalizer</span>
                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                  Live Vacantes Disponibles
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/10">
                {vacancies.map((v) => (
                  <div
                    key={v.id}
                    className="p-4 bg-white border border-slate-150 rounded-2xl flex flex-col gap-3 hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h4 className="font-black text-slate-800 text-sm truncate">
                        {v.escuela}
                      </h4>
                      <div className="text-right shrink-0">
                        <span className={`text-2xl font-black ${v.vacantes_disponibles > 0 ? "text-primary" : "text-red-500"}`}>
                          {v.vacantes_disponibles}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold block uppercase mt-[-2px] tracking-wider leading-none">
                          Disp de {v.vacantes_totales}
                        </span>
                      </div>
                    </div>
                    
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                      <div
                        className={`h-full transition-all duration-500 ${v.vacantes_disponibles > 0 ? "bg-gradient-to-r from-primary to-blue-400" : "bg-gradient-to-r from-red-500 to-red-400"}`}
                        style={{
                          width: `${v.vacantes_totales === 0 ? 0 : (v.vacantes_disponibles / v.vacantes_totales) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {vacancies.length === 0 && (
                  <div className="text-center text-slate-400 py-12 font-bold">
                    No hay vacantes configuradas.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pizarra Vacantes Interactive Configuration & Preview Modal */}
      {showPizarraModal && (() => {
        const activeAreas = Array.from(new Set(reportData.map((d) => d.area)))
          .filter((a): a is string => !!a && a !== "_" && a !== "")
          .sort();

        // Helper function to render the high-resolution board content precisely
        const renderPizarraCanvasContent = () => (
          <>
            {/* Subdued background watermark logo */}
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none z-0">
              <img
                src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/escudo%20oficial-02%20(2).png"
                crossOrigin="anonymous"
                alt="UNSAAC Watermark"
                className="w-[500px] h-[500px] object-contain"
              />
            </div>

            {/* Header Block according to official layout */}
            <div className="relative z-10 flex flex-col shrink-0 gap-y-3">
              <div className="flex justify-between items-center px-4">
                <img
                  src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/escudo%20oficial-02%20(2).png"
                  crossOrigin="anonymous"
                  alt="UNSAAC Escudo"
                  style={{ height: "65px" }}
                  className="object-contain"
                />
                <div className="text-center">
                  <h1 className="text-2xl font-black tracking-tight text-[#8B1525] uppercase leading-none">
                    Universidad Nacional de San Antonio Abad del Cusco
                  </h1>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-extrabold mt-1.5">
                    Dirección de Admisión • Oficina de Sistemas
                  </p>
                </div>
                <img
                  src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/logo%20admision%202.png"
                  crossOrigin="anonymous"
                  alt="Admisión"
                  style={{ height: "60px" }}
                  className="object-contain"
                />
              </div>

              {/* Top banner */}
              <div className="bg-[#C00C30] text-center py-2 px-6 rounded-lg shadow-sm">
                <h2 className="text-3xl font-black tracking-[0.2em] text-white uppercase leading-none select-none drop-shadow-sm">
                  CUADRO DE VACANTES
                </h2>
              </div>

              {/* Centered red subtitle */}
              <div className="text-center mt-1">
                <h3 className="text-base font-black text-[#C00C30] uppercase tracking-widest leading-none select-none">
                  ADJUDICACIÓN {activeProcessName}
                </h3>
              </div>
            </div>

            {/* Columns Grid Layout */}
            <div
              className="relative z-10 flex-grow grid gap-4 mt-4"
              style={{
                gridTemplateColumns: `repeat(${activeAreas.length + 1}, minmax(0, 1fr))`,
                maxHeight: "410px",
              }}
            >
              {/* Dynamic Areas Columns */}
              {activeAreas.map((areaVal) => {
                const areaVacancies = reportData.filter(
                  (v) => v.area === areaVal && v.vacantes_disponibles > 0
                );

                return (
                  <div
                    key={areaVal}
                    className="flex flex-col border-[2px] border-[#C00C30] rounded-xl bg-white overflow-hidden shadow-sm h-full"
                  >
                    {/* Area Column Header */}
                    <div className="bg-[#C00C30] text-center py-1.5 shrink-0">
                      <span className="font-extrabold text-sm tracking-widest text-white uppercase select-none">
                        ÁREA &quot;{areaVal}&quot;
                      </span>
                    </div>

                    {/* Rows Table */}
                    <div className="flex-1 overflow-hidden divide-y divide-[#E2B07A] flex flex-col justify-start">
                      {areaVacancies.slice(0, 11).map((vac) => (
                        <div
                          key={vac.escuela}
                          className="flex items-stretch min-h-[32px] bg-white divide-x divide-[#E2B07A] last:border-b-0 flex-grow"
                        >
                          <div className="flex-1 flex items-center justify-center px-2 py-0.5 text-center leading-snug">
                            <span className="font-black text-[9px] text-slate-800 tracking-tight uppercase select-none whitespace-normal">
                              {vac.escuela}
                            </span>
                          </div>
                          <div className="w-12 shrink-0 flex items-center justify-center font-black text-xs text-[#C00C30] font-mono select-none bg-amber-50/15">
                            {vac.vacantes_disponibles}
                          </div>
                        </div>
                      ))}
                      {areaVacancies.length === 0 && (
                        <div className="text-center text-slate-300 py-12 text-[10px] font-bold uppercase select-none">
                          Sin vacantes
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Rightmost Panel: Official Requirements Block */}
              <div className="flex flex-col h-full bg-[#fdfcfa] select-none pl-1">
                <h4 className="text-[#C00C30] font-black text-sm tracking-widest uppercase leading-none mb-3">
                  REQUISITOS PARA ADJUDICAR
                </h4>
                
                {/* Rich bullets */}
                <div className="space-y-2 flex-grow">
                  {pizarraRequisitos
                    .filter((r) => r.trim() !== "")
                    .map((req, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-[#E28F3A] text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 shadow-sm">
                          {idx + 1}
                        </div>
                        <span className="text-[9px] font-black text-slate-700 leading-snug uppercase tracking-tight">
                          {req}
                        </span>
                      </div>
                    ))}
                </div>

                {/* Horas de Adjudicación Area schedules at bottom */}
                <div className="mt-2 border-t border-slate-200 pt-3 shrink-0">
                  <div className="flex items-center gap-1 justify-around">
                    {activeAreas.map((areaVal) => (
                      <div key={areaVal} className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-950 text-white flex items-center justify-center font-black text-xs shadow-md">
                          {areaVal}
                        </div>
                        <span className="text-[8px] font-black text-slate-800 mt-1 uppercase tracking-tighter text-center whitespace-nowrap leading-none">
                          {pizarraHorarios[areaVal] || "Por def"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Section */}
            <div className="relative z-10 border-t-[2px] border-[#C00C30] pt-3 mt-3 flex justify-between items-end shrink-0">
              <div className="flex flex-col leading-none">
                <span className="text-3xl font-extrabold text-[#C00C30] uppercase tracking-tighter select-none font-sans block">
                  {pizarraFecha}
                </span>
                <span className="text-[10px] font-black text-[#C05C6B] uppercase mt-1 select-none leading-none tracking-wide text-left">
                  Lugar: {pizarraLugar}
                </span>
              </div>

              <div className="flex flex-col text-right max-w-lg select-none">
                <span className="text-xl font-black text-[#C00C30] uppercase select-none leading-none block">
                  Costo: {pizarraCosto}
                </span>
                <span className="text-[8px] font-black text-[#C05C6B] uppercase mt-1 select-none leading-snug tracking-tighter text-right">
                  {pizarraMetodo}
                </span>
              </div>
            </div>
          </>
        );

        return (
          <div className="fixed inset-0 z-[250] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
            
            {/* Pristine Hidden Canvas for Image/PDF generation (Completely unscaled, separate DOM tree) */}
            <div
              style={{
                position: "fixed",
                left: "-9999px",
                top: "0px",
                width: "1280px",
                height: "720px",
                transform: "none",
                zIndex: -100,
                pointerEvents: "none",
              }}
            >
              <div
                ref={pdfRef}
                style={{
                  width: "1280px",
                  height: "720px",
                  backgroundColor: "#FFFFFF",
                  padding: "36px 48px",
                  boxSizing: "border-box",
                  position: "relative",
                }}
                className="flex flex-col justify-between font-sans overflow-hidden bg-white"
              >
                {renderPizarraCanvasContent()}
              </div>
            </div>

            <div className="bg-white rounded-3xl max-w-7xl w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row max-h-[92vh]">
              
              {/* Left Column: Real-time Live Board Canvas Preview */}
              <div className="flex-1 bg-slate-100 p-6 flex flex-col items-center justify-center border-r border-slate-100 overflow-y-auto">
                <div className="text-xs font-black uppercase tracking-widest text-slate-450 mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] animate-pulse text-red-500">live_tv</span>
                  Vista Previa de la Pizarra de Adjudicación
                </div>

                {/* Elegant Scaled Frame (Using scale 0.50 purely for layout display) */}
                <div className="w-[640px] h-[360px] overflow-hidden rounded-2xl border-4 border-slate-200 shadow-xl relative bg-white shrink-0 select-none">
                  <div style={{ transform: "scale(0.50)", transformOrigin: "top left" }} className="absolute inset-0">
                    
                    {/* Live Unregistered Virtual Canvas (Matches exactly but has no ref and no exports dependency) */}
                    <div
                      style={{
                        width: "1280px",
                        height: "720px",
                        backgroundColor: "#FFFFFF",
                        padding: "36px 48px",
                        boxSizing: "border-box",
                        position: "relative",
                      }}
                      className="flex flex-col justify-between font-sans overflow-hidden select-none bg-white shadow-inner"
                    >
                      {renderPizarraCanvasContent()}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] font-bold text-slate-500 mt-3 text-center leading-relaxed font-sans">
                  💡 El lienzo virtual se renderiza con resolución nativa cristalina (1280x720) para evitar recortes o desenfoques en pantallas.
                </p>
              </div>

              {/* Right Column: Editing settings drawer */}
              <div className="w-full md:w-96 flex flex-col h-full overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-600 font-bold text-[22px]">edit_note</span>
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-wider font-sans">
                      Detalles Adicionales
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowPizarraModal(false)}
                    className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-sm font-bold">close</span>
                  </button>
                </div>

                {/* Form elements Scrollable area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  
                  {/* Fecha de Adjudicación */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-450 tracking-widest block mb-1.5 font-sans">
                      Fecha del Banner (Izquierda)
                    </label>
                    <input
                      type="text"
                      value={pizarraFecha}
                      onChange={(e) => setPizarraFecha(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-800 outline-none focus:border-primary transition-all font-sans"
                      placeholder="Ej: Miércoles 26 Noviembre"
                    />
                  </div>

                  {/* Lugar */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-450 tracking-widest block mb-1.5 font-sans">
                      Lugar de la Adjudicación
                    </label>
                    <input
                      type="text"
                      value={pizarraLugar}
                      onChange={(e) => setPizarraLugar(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-slate-800 outline-none focus:border-primary transition-all font-sans"
                      placeholder="Ej: auditorio de la Facultad de Ciencias Sociales"
                    />
                  </div>

                  {/* Costos */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[10px] font-black uppercase text-slate-450 tracking-widest block mb-1.5 font-sans">
                        Costo
                      </label>
                      <input
                        type="text"
                        value={pizarraCosto}
                        onChange={(e) => setPizarraCosto(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-black text-slate-800 outline-none focus:border-primary transition-all font-sans"
                        placeholder="Ej: S/300.00"
                      />
                    </div>
                  </div>

                  {/* Advertencia / Método de pago */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-450 tracking-widest block mb-1.5 font-sans">
                      Instrucción del Pago (Derecha)
                    </label>
                    <textarea
                      value={pizarraMetodo}
                      onChange={(e) => setPizarraMetodo(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 outline-none focus:border-primary transition-all resize-none font-sans"
                      placeholder="Ej: PAGAR EN EL AUDITORIO AL MOMENTO DE ADJUDICAR..."
                    />
                  </div>

                  {/* Requisitos (uno por línea) */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-450 tracking-widest block mb-1.5 font-sans">
                      Requisitos (uno por línea)
                    </label>
                    <textarea
                      value={pizarraRequisitos.join("\n")}
                      onChange={(e) => setPizarraRequisitos(e.target.value.split("\n"))}
                      rows={4}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-extrabold text-slate-800 outline-none focus:border-primary transition-all font-mono"
                      placeholder="Escribe un requisito por línea..."
                    />
                  </div>

                  {/* Horarios por Área */}
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-450 tracking-widest block mb-3 font-sans">
                      Horarios por Área
                    </label>
                    <div className="space-y-2">
                      {activeAreas.map((areaVal) => (
                        <div key={areaVal} className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-900 border border-slate-950 text-white flex items-center justify-center font-black text-[10px] shrink-0 select-none">
                            {areaVal}
                          </span>
                          <input
                            type="text"
                            value={pizarraHorarios[areaVal] || ""}
                            onChange={(e) =>
                              setPizarraHorarios({
                                ...pizarraHorarios,
                                [areaVal]: e.target.value,
                              })
                            }
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-[#C00C30] transition-colors font-sans"
                            placeholder="Ej: 9:00 Horas"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* Footer Action Buttons inside drawer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0 space-y-2">
                  <button
                    onClick={downloadPizarraImage}
                    disabled={generatingPdf}
                    className="w-full py-3.5 bg-primary text-white hover:bg-primary/95 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:scale-[1.01] flex items-center justify-center gap-2 disabled:opacity-50 font-sans"
                  >
                    <span className="material-symbols-outlined text-sm font-black">image</span>
                    {generatingPdf ? "Generando..." : "Descargar Imagen (PNG)"}
                  </button>

                  <button
                    onClick={generatePDFReport}
                    disabled={generatingPdf}
                    className="w-full py-3 bg-white text-slate-700 hover:text-slate-900 border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 font-sans"
                  >
                    <span className="material-symbols-outlined text-sm text-red-600 font-bold">picture_as_pdf</span>
                    {generatingPdf ? "Generando..." : "Descargar PDF (Landscape)"}
                  </button>

                  <button
                    onClick={() => setShowPizarraModal(false)}
                    className="w-full py-2.5 bg-slate-200/60 text-slate-500 hover:text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all text-center font-sans"
                  >
                    Cerrar Editor
                  </button>
                </div>

              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
