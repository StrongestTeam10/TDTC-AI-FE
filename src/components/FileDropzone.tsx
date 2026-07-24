import { useRef, useState, type DragEvent } from 'react';

// 2026-07-24 추가 (게시판 UI 설계서 반영 - 글쓰기 화면 파일 업로드)
// UI 설계서(6-6,7)의 "드래그 앤 드랍 또는 클릭하여 파일 추가(다중 가능)" +
// "업로드 지연을 시각적으로 나타내기 위한 로딩 스피너"를 반영.
// 실제 업로드는 폼 제출 시 한 번에 이뤄지므로(각 파일 개별 업로드가 아님),
// uploadProgress는 제출 중(폼 전체 전송률)일 때만 표시되고, 그 전까지는 선택된
// 파일 목록만 보여줌.
interface FileDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  uploadProgress?: number | null; // 0~100, null/undefined면 업로드 중이 아님
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function FileDropzone({ files, onChange, uploadProgress }: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadProgress !== null && uploadProgress !== undefined;

  const addFiles = (incoming: FileList | File[]) => {
    const newFiles = Array.from(incoming);
    // 같은 이름+크기 파일 중복 추가 방지(간단한 휴리스틱)
    const merged = [...files];
    newFiles.forEach((f) => {
      if (!merged.some((existing) => existing.name === f.name && existing.size === f.size)) {
        merged.push(f);
      }
    });
    onChange(merged);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={`cursor-pointer rounded border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-500/10 text-blue-300'
            : 'border-slate-700 text-slate-400 hover:border-slate-600'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        드래그 앤 드롭 또는 클릭하여 파일 추가 (다중 가능)
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-300"
            >
              <span className="truncate">
                📎 {file.name} <span className="text-slate-500">({formatFileSize(file.size)})</span>
              </span>
              {isUploading ? (
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-600 border-t-blue-500"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="shrink-0 text-slate-500 hover:text-red-400"
                  aria-label={`${file.name} 제거`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isUploading && (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">업로드 중... {uploadProgress}%</p>
        </div>
      )}
    </div>
  );
}
