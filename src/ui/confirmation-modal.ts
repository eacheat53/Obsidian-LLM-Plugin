import { App, Modal, Setting, ButtonComponent, TextComponent } from 'obsidian';

export class ConfirmationModal extends Modal {
  private onConfirm: () => void;
  private title: string;
  private message: string;
  private confirmationText: string;
  private confirmButtonText: string;

  constructor(app: App, title: string, message: string, confirmationText: string, confirmButtonText: string, onConfirm: () => void) {
    super(app);
    this.title = title;
    this.message = message;
    this.confirmationText = confirmationText;
    this.confirmButtonText = confirmButtonText;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.title });
    contentEl.createEl('p', { text: this.message });

    let inputText = '';
    let confirmButton: ButtonComponent;

    new Setting(contentEl)
      .addText(text => {
        text.setPlaceholder(this.confirmationText)
          .onChange(value => {
            inputText = value;
            confirmButton.setDisabled(inputText !== this.confirmationText);
          });
        text.inputEl.style.width = '100%';
      });

    new Setting(contentEl)
      .addButton(button => {
        confirmButton = button;
        button.setButtonText(this.confirmButtonText)
          .setWarning()
          .setDisabled(true)
          .onClick(() => {
            this.onConfirm();
            this.close();
          });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
