import ExpoModulesCore
import ExpoUI
import SwiftUI

enum NomlySearchPlacement: String, Enumerable { case automatic, toolbar, navigationBarDrawer }
enum NomlySearchFocusAction: String, Enumerable { case focus, blur, toggle }

struct NomlySearchableModifier: ViewModifier, Record {
  @Field var text: String = ""
  @Field var textRevision: Int = 0
  @Field var prompt: String = "Search"
  @Field var placement: NomlySearchPlacement = .navigationBarDrawer
  @Field var alwaysVisible: Bool = true
  @Field var focusAction: NomlySearchFocusAction = .blur
  @Field var focusRevision: Int = 0
  var dispatcher: EventDispatcher?

  init() {}

  init(params: [String: Any], appContext: AppContext, dispatcher: EventDispatcher) throws {
    try self = .init(from: params, appContext: appContext)
    self.dispatcher = dispatcher
  }

  @ViewBuilder
  func body(content: Content) -> some View {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      NomlySearchableContent(configuration: self, content: content)
    } else { content }
    #else
    content
    #endif
  }
}

#if compiler(>=6.2)
@available(iOS 26.0, *)
private struct NomlySearchableContent<Content: View>: View {
  let configuration: NomlySearchableModifier
  let content: Content
  @State private var query: String
  @State private var presented = false
  @FocusState private var focused: Bool

  init(configuration: NomlySearchableModifier, content: Content) {
    self.configuration = configuration
    self.content = content
    _query = State(initialValue: configuration.text)
  }

  private var placement: SearchFieldPlacement {
    switch configuration.placement {
    case .automatic: return .automatic
    case .toolbar: return .toolbar
    case .navigationBarDrawer:
      return .navigationBarDrawer(displayMode: configuration.alwaysVisible ? .always : .automatic)
    }
  }

  var body: some View {
    content
      .searchable(text: $query, isPresented: $presented, placement: placement, prompt: Text(configuration.prompt))
      .searchFocused($focused)
      // Only explicit JS text commands replace native input. Echoing each keystroke
      // through controlled props could overwrite newer edits when JS is busy.
      .onChange(of: configuration.textRevision) { _ in query = configuration.text }
      .onChange(of: query) { value in emit(["text": value]) }
      .onChange(of: focused) { value in emit(["focused": value]) }
      .onChange(of: presented) { value in
        if !value { focused = false }
        emit(["presented": value])
      }
      .task(id: configuration.focusRevision) {
        guard configuration.focusRevision > 0 else { return }
        let shouldFocus: Bool
        switch configuration.focusAction {
        case .focus: shouldFocus = true
        case .blur: shouldFocus = false
        case .toggle: shouldFocus = !(focused || presented)
        }
        if shouldFocus {
          presented = true
          // Allow SwiftUI to present its native search field before requesting focus.
          await Task.yield()
          guard !Task.isCancelled else { return }
          focused = true
        } else {
          focused = false
          presented = false
        }
      }
      .onDisappear { focused = false; presented = false }
  }

  private func emit(_ payload: [String: Any]) {
    configuration.dispatcher?(["nomlySearchable": payload])
  }
}
#endif
