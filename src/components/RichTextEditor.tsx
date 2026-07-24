import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';

// 2026-07-24 추가 (게시판 UI 설계서 반영 - 글쓰기 화면 리치 텍스트 에디터)
// UI 설계서(6-4,5)의 "굵게/기울임/밑줄, 정렬, 목록, 이미지, 링크, 색" 툴바를 Tiptap으로 구현.
// 동영상 삽입은 이번 범위에서 제외함(별도 안내 없이는 임의로 iframe 삽입을 열어두는 게
// XSS 표면을 넓히는 선택이라, 필요해지면 서버 검증(허용 도메인 화이트리스트)과 함께
// 별도로 다시 논의하는 게 안전함).
//
// 이미지 삽입은 별도 업로드 API 없이 base64 data URL로 콘텐츠(HTML)에 직접 내장함
// (구현 단순화 목적) - 이미지가 많아지면 게시글 content 용량이 커질 수 있음(참고용).
//
// 저장되는 값은 HTML 문자열이라, 화면에 그대로 렌더링할 때는 반드시 DOMPurify로
// sanitize 후 표시해야 함(BoardDetailPage 참고) - 저장된 HTML을 그대로 신뢰하지 않음.
interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      // 2026-07-25 버그 수정: Tiptap v3의 StarterKit은 Underline/Link를 기본 포함하는데,
      // 별도로 Underline/Link 확장을 또 추가해서 "Duplicate extension names found"
      // 경고가 발생했었음. Link는 StarterKit의 link 옵션으로 설정하고 별도 확장은 제거.
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Image,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class:
          'min-h-[240px] rounded-b border border-t-0 border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none prose prose-invert prose-sm max-w-none',
      },
    },
  });

  // 수정 화면에서 비동기로 기존 게시글을 불러온 뒤 value가 뒤늦게 채워지는 경우,
  // 에디터 초기 콘텐츠를 한 번 더 동기화함
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !editor.isFocused) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const handleImageButtonClick = () => fileInputRef.current?.click();

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 다시 선택해도 change 이벤트 발생하도록 초기화
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        editor.chain().focus().setImage({ src: reader.result }).run();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLinkButtonClick = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('링크 URL을 입력하세요', previousUrl ?? 'https://');
    if (url === null) return; // 취소
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t border border-slate-700 bg-slate-900 p-2">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="굵게">
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="기울임">
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} label="밑줄">
          <span className="underline">U</span>
        </ToolbarButton>

        <Divider />

        <ToolbarButton active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} label="왼쪽 정렬">
          ⬅
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} label="가운데 정렬">
          ⬌
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} label="오른쪽 정렬">
          ➡
        </ToolbarButton>

        <Divider />

        <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="글머리 목록">
          •≡
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="번호 목록">
          1≡
        </ToolbarButton>

        <Divider />

        <ToolbarButton active={false} onClick={handleImageButtonClick} label="이미지 삽입">
          🖼
        </ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />

        <ToolbarButton active={editor.isActive('link')} onClick={handleLinkButtonClick} label="링크">
          🔗
        </ToolbarButton>

        <label className="ml-1 flex cursor-pointer items-center gap-1 text-xs text-slate-400" title="글자 색">
          색
          <input
            type="color"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="h-6 w-6 cursor-pointer rounded border border-slate-700 bg-transparent p-0"
          />
        </label>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-slate-700" />;
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm ${
        active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}
