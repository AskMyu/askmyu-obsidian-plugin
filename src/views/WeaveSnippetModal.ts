import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import { weaveSnippets, type WeaveSnippet } from '../vault/weaveRecipes';

/** Pick a recipe; the caller puts it where the cursor is. */
export class WeaveSnippetModal extends FuzzySuggestModal<WeaveSnippet> {
  constructor(
    app: App,
    private folder: string,
    private onPick: (snippet: WeaveSnippet) => void,
  ) {
    super(app);
    this.setPlaceholder('Insert a Myu snippet…');
  }

  getItems(): WeaveSnippet[] {
    return weaveSnippets(this.folder);
  }

  getItemText(snippet: WeaveSnippet): string {
    return `${snippet.name} ${snippet.text}`;
  }

  override renderSuggestion(match: FuzzyMatch<WeaveSnippet>, el: HTMLElement): void {
    el.createDiv({ text: match.item.name });
    el.createDiv({ cls: 'myu-quiet', text: match.item.text.split('\n')[0] ?? '' });
  }

  onChooseItem(snippet: WeaveSnippet): void {
    this.onPick(snippet);
  }
}
