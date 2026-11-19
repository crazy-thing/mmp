import { Color } from '@tiptap/extension-color';
import { Image } from '@tiptap/extension-image';
import ListItem from '@tiptap/extension-list-item';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Youtube from '@tiptap/extension-youtube';
import { EditorProvider, useCurrentEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { AlignCenter, AlignLeft, AlignRight, Bold, Code, Image as ImageIcon, Italic, List, ListOrdered, Pilcrow, Redo, RemoveFormatting, Strikethrough, Undo, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import { ResizableImage } from 'tiptap-extension-resizable-image';
import 'tiptap-extension-resizable-image/styles.css';

const btnClass = 'flex h-[37px] min-w-[37px] items-center justify-center px-[8px] text-[16px] font-semibold rounded-[8px] text-[#bbb] transition-colors hover:bg-[#282a2e] hover:text-white';
const activeBtnClass = '!bg-[#3e3e5d] !text-white';
const disabledClass = 'disabled:opacity-50 disabled:cursor-not-allowed';

interface BtnProps {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}

const Btn = ({ onClick, disabled, active, children }: BtnProps) => (
  <button type="button" onClick={onClick} disabled={disabled} className={`${btnClass} ${disabled ? disabledClass : ''} ${active ? activeBtnClass : ''}`}>
    {children}
  </button>
);

const MenuBar = () => {
  const { editor } = useCurrentEditor();

  const insertImage = () => {
    const url = prompt('Enter the URL of the image:');
    if (url && editor) editor.chain().focus().setResizableImage({ src: url }).run();
  };

  const addYoutubeVideo = () => {
    const url = prompt('Enter YouTube URL:');
    const width = prompt('Enter width (in pixels):');
    const height = prompt('Enter height (in pixels):');
    if (url && width && height && editor) {
      editor.chain().focus().setYoutubeVideo({ src: url, width: parseInt(width), height: parseInt(height) }).run();
    }
  };

  if (!editor) return null;

  return (
    <div className='flex h-[55px] w-full shrink-0 items-center gap-[2px] overflow-x-auto rounded-[15px] border-2 border-mm-frame bg-mm-bg px-[8px] [scrollbar-width:none]'>
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} disabled={!editor.can().chain().focus().toggleBold().run()} active={editor.isActive('bold')}><Bold size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} disabled={!editor.can().chain().focus().toggleItalic().run()} active={editor.isActive('italic')}><Italic size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} disabled={!editor.can().chain().focus().toggleStrike().run()} active={editor.isActive('strike')}><Strikethrough size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().unsetAllMarks().run()}><RemoveFormatting size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')}><Pilcrow size={20} /></Btn>
      {([1, 2, 3, 4, 5, 6] as const).map((level) => (
        <Btn key={level} onClick={() => editor.chain().focus().toggleHeading({ level }).run()} active={editor.isActive('heading', { level })}>H{level}</Btn>
      ))}
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}><List size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}><ListOrdered size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })}><AlignLeft size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })}><AlignCenter size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })}><AlignRight size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')}><Code size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().chain().focus().undo().run()}><Undo size={20} /></Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().chain().focus().redo().run()}><Redo size={20} /></Btn>
      <Btn onClick={insertImage}><ImageIcon size={20} /></Btn>
      <Btn onClick={addYoutubeVideo}><Video size={20} /></Btn>
    </div>
  );
};

const extensions = [
  Color.configure({ types: [TextStyle.name, ListItem.name] }),
  TextStyle,
  StarterKit.configure({
    bulletList: { keepMarks: true, keepAttributes: false },
    orderedList: { keepMarks: true, keepAttributes: false },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
  ResizableImage.configure({ defaultWidth: 600, defaultHeight: 300 }),
  Youtube.configure({ controls: true, allowFullscreen: true, inline: true }),
  Image,
];

interface TextEditProps {
  handleFormChange: (updatedHtml: string) => void;
  /** Only read on first render. Remount (with a key) to load different content. */
  existingHtml: string;
  className?: string;
}

/** Toolbar box on top, editor box below (Figma: Add Version, right column). */
const TextEdit = ({ handleFormChange, existingHtml, className = '' }: TextEditProps) => {
  return (
    <div className={`flex flex-col gap-[14px] ${className}`}>
      <EditorProvider
        extensions={extensions}
        content={existingHtml}
        slotBefore={<MenuBar />}
        onUpdate={({ editor }) => handleFormChange(editor.getHTML())}
        editorContainerProps={{ className: 'min-h-0 flex-1 overflow-y-auto rounded-[15px] border-2 border-mm-frame bg-mm-bg' }}
        editorProps={{
          attributes: {
            class: 'tiptap min-h-full p-[20px] text-white focus:outline-none',
          },
        }}
      />
    </div>
  );
};

export default TextEdit;
