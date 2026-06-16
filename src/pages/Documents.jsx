import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { 
    ArrowLeft, Search, FileText, FileSpreadsheet, FileImage, 
    FileArchive, File, Download, Loader2, Calendar, User, Info, Eye
} from 'lucide-react';
import './Documents.css';

const Documents = () => {
    const { authFetch } = useAuth();
    const navigate = useNavigate();

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [downloadingId, setDownloadingId] = useState(null);
    const [viewingId, setViewingId] = useState(null);
    const [pdfViewerUrl, setPdfViewerUrl] = useState(null);
    const [pdfViewerTitle, setPdfViewerTitle] = useState('');

    useEffect(() => {
        authFetch('/api/documents')
            .then(res => res.json())
            .then(data => {
                setDocuments(data.documents || []);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching documents:", err);
                setLoading(false);
            });
    }, [authFetch]);

    const getFileIcon = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        const size = 28;
        const className = "doc-type-icon";
        switch (ext) {
            case 'pdf':
                return <FileText size={size} className={`${className} pdf-icon`} />;
            case 'xlsx':
            case 'xls':
            case 'csv':
                return <FileSpreadsheet size={size} className={`${className} excel-icon`} />;
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'svg':
                return <FileImage size={size} className={`${className} image-icon`} />;
            case 'zip':
            case 'rar':
            case 'tar':
            case 'gz':
            case '7z':
                return <FileArchive size={size} className={`${className} archive-icon`} />;
            default:
                return <File size={size} className={`${className} default-icon`} />;
        }
    };

    const handleDownload = async (docId, filename, fileType) => {
        try {
            setDownloadingId(docId);
            const res = await authFetch(`/api/documents/${docId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to download document.');

            const base64Data = data.document.file_data;
            const base64Content = base64Data.includes(';base64,') 
                ? base64Data.split(';base64,')[1] 
                : base64Data;
            
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: fileType || 'application/octet-stream' });
            
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (err) {
            alert("Error downloading document: " + err.message);
        } finally {
            setDownloadingId(null);
        }
    };

    const handleViewPDF = async (docId, filename, fileType) => {
        try {
            setViewingId(docId);
            const res = await authFetch(`/api/documents/${docId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to view document.');

            const base64Data = data.document.file_data;
            const base64Content = base64Data.includes(';base64,') 
                ? base64Data.split(';base64,')[1] 
                : base64Data;
            
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            
            const fileURL = URL.createObjectURL(blob);
            setPdfViewerUrl(fileURL);
            setPdfViewerTitle(filename);
        } catch (err) {
            alert("Error viewing PDF: " + err.message);
        } finally {
            setViewingId(null);
        }
    };

    const handleClosePDFViewer = () => {
        if (pdfViewerUrl) {
            URL.revokeObjectURL(pdfViewerUrl);
            setPdfViewerUrl(null);
        }
        setPdfViewerTitle('');
    };

    const filteredDocs = documents.filter(doc => 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.notes && doc.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatBytes = (bytes) => {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="docs-portal-container animate-fade-in">
            {/* Header */}
            <header className="docs-portal-header glass">
                <div className="header-left">
                    <Button variant="ghost" onClick={() => navigate('/')} className="back-btn">
                        <ArrowLeft size={16} /> Back to Setup
                    </Button>
                    <div className="portal-title">
                        <FileText size={28} className="title-icon" />
                        <h1>Study Materials & Shared Docs</h1>
                    </div>
                </div>
                <div className="header-right">
                    <div className="search-bar">
                        <Search size={16} className="search-icon" />
                        <input 
                            type="text" 
                            placeholder="Search shared documents..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="docs-loading">
                    <Loader2 size={40} className="animate-spin text-primary" />
                    <p>Loading study materials...</p>
                </div>
            ) : (
                <div className="docs-content-area">
                    {filteredDocs.length === 0 ? (
                        <Card className="empty-docs-card glass text-center">
                            <Info size={48} className="empty-icon" />
                            <h3>No Materials Found</h3>
                            <p>
                                {searchQuery 
                                    ? "No documents matched your search query. Try another term!"
                                    : "Admins haven't shared any documents or study notes yet."}
                            </p>
                        </Card>
                    ) : (
                        <div className="docs-grid">
                            {filteredDocs.map(doc => (
                                <Card key={doc.id} className="doc-card glass hover-lift">
                                    <div className="doc-card-header">
                                        <div className="icon-wrapper">
                                            {getFileIcon(doc.filename)}
                                        </div>
                                        <div className="doc-card-title-block">
                                            <h3 className="doc-card-title" title={doc.title}>{doc.title}</h3>
                                            <span className="doc-filename-span" title={doc.filename}>{doc.filename}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="doc-card-body">
                                        {doc.notes ? (
                                            <p className="doc-notes-text">{doc.notes}</p>
                                        ) : (
                                            <p className="doc-notes-text empty-notes">No description provided for this material.</p>
                                        )}
                                    </div>

                                    <div className="doc-card-footer">
                                        <div className="doc-meta-info">
                                            <div className="meta-row">
                                                <User size={12} className="meta-icon" />
                                                <span>{doc.uploader_name}</span>
                                            </div>
                                            <div className="meta-row">
                                                <Calendar size={12} className="meta-icon" />
                                                <span>{new Date(doc.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                            </div>
                                            <div className="meta-row size-meta">
                                                <span>Size: {formatBytes(doc.file_size)}</span>
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {doc.filename.toLowerCase().endsWith('.pdf') && (
                                                <Button 
                                                    variant="outline" 
                                                    className="download-btn flex-center gap-1.5"
                                                    disabled={viewingId === doc.id}
                                                    onClick={() => handleViewPDF(doc.id, doc.filename, doc.file_type)}
                                                >
                                                    {viewingId === doc.id ? (
                                                        <>
                                                            <Loader2 size={14} className="animate-spin" />
                                                            <span>Loading</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Eye size={14} />
                                                            <span>View PDF</span>
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                            <Button 
                                                variant="primary" 
                                                className="download-btn flex-center gap-1.5"
                                                disabled={downloadingId === doc.id}
                                                onClick={() => handleDownload(doc.id, doc.filename, doc.file_type)}
                                            >
                                                {downloadingId === doc.id ? (
                                                    <>
                                                        <Loader2 size={14} className="animate-spin" />
                                                        <span>Downloading</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download size={14} />
                                                        <span>Download</span>
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {pdfViewerUrl && (
                <div className="pdf-viewer-modal-backdrop" onClick={handleClosePDFViewer}>
                    <div className="pdf-viewer-modal-content glass" onClick={(e) => e.stopPropagation()}>
                        <div className="pdf-viewer-header">
                            <div className="pdf-viewer-title-area">
                                <FileText size={18} className="text-primary" style={{ color: '#818cf8' }} />
                                <h3>{pdfViewerTitle}</h3>
                            </div>
                            <button className="pdf-viewer-close-btn" onClick={handleClosePDFViewer}>&times;</button>
                        </div>
                        <div className="pdf-viewer-body">
                            <iframe src={pdfViewerUrl} width="100%" height="100%" title={pdfViewerTitle} frameBorder="0" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Documents;
