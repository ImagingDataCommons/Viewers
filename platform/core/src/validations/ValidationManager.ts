export default class ValidationManager {
  private _displaySetValidations: any;
  // private _studyValidations: any;
  // private _seriesValidations: any;
  // private _imageValidations: any;
  private _validationModules: any;

  // constructor({
  //   commandsManager,
  //   servicesManager,
  //   hotkeysManager,
  //   appConfig = {},
  // }: any) {}
  constructor(commandsManager, servicesManager) {
    // (JU) Initialise these private variables, not sure is needed, but viewer loaded ok after adding them ...
    this._validationModules = [];
    this._displaySetValidations = [];
  }
  public registerValidationModule(validationModule: any) {
    console.log('JU - validationModules:');
    console.log(this._validationModules);
    this._validationModules.push(validationModule);

    validationModule.validations.forEach(validationDefinition => {
      this.registerValidationDefinition(validationDefinition);
    });
  }

  public registerValidationDefinition(validationDefinition: any) {
    switch (validationDefinition.type) {
      case 'displaySet':
        console.log('nada...');
        this._displaySetValidations.push(validationDefinition);
        break;
      // case 'study':
      //   this._studyValidations.push(validationDefinition);
      //   break;
      // case 'series':
      //   this._seriesValidations.push(validationDefinition);
      //   break;
      // case 'image':
      //   this._imageValidations.push(validationDefinition);
      //   break;
    }
  }

  public validateDisplaySet(displaySet: any) {
    const validationResults = this._displaySetValidations.map(
      validationDefinition => validationDefinition.validate(displaySet)
    );

    // validationResults.forEach(validationResult => {
    //   if (validationResult.messageType === 'toast') {
    //     UINotificationService.show({ type: validationResult.messageType, message: validationResult.message });
    //   }
    // });
    // if (validationResults.messageType === 'thumbnail') {
    //   UINotificationService.show({ type: validationResult.messageType, message: validationResult.message });
    // }

    return validationResults.flat();
  }

  // public validateStudy(studyMetadata, displaySet) {
  //   // ...
  // }

  // public validateSeries(seriesMetadata, displaySet) {
  //   // ...
  // }

  // public validateImage(imageMetadata, displaySet) {
  //   // ...
  // }
}
