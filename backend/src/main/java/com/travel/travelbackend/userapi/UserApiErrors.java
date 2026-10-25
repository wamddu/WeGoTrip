package com.travel.travelbackend.userapi;
import com.travel.travelbackend.controller.UserController;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.Map;
@RestControllerAdvice(assignableTypes = {UserController.class, com.travel.travelbackend.controller.AuthController.class, com.travel.travelbackend.controller.TripController.class, com.travel.travelbackend.controller.PartyController.class, com.travel.travelbackend.controller.PlaceController.class, com.travel.travelbackend.controller.ItineraryController.class, com.travel.travelbackend.controller.ExpenseController.class, com.travel.travelbackend.controller.SettlementController.class, com.travel.travelbackend.controller.PackingController.class, com.travel.travelbackend.controller.ChatController.class, com.travel.travelbackend.controller.NoticeController.class})
public class UserApiErrors {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<?> api(ApiException e) { return response(e.status, e.code, e.getMessage()); }
    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
    ResponseEntity<?> invalid(Exception e) { return api(ApiException.invalid()); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<?> conflict(Exception e) { return response(409, "CONFLICT", "중복되거나 현재 상태에서 처리할 수 없는 요청입니다."); }
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    ResponseEntity<?> tooLarge(Exception e) { return response(413, "IMAGE_TOO_LARGE", "이미지는 8MB 이하로 선택해 주세요."); }
    @ExceptionHandler(org.springframework.web.multipart.support.MissingServletRequestPartException.class)
    ResponseEntity<?> missingPart(Exception e) { return api(ApiException.invalid()); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<?> internal(Exception e) { return response(500, "INTERNAL_SERVER_ERROR", "요청 처리 중 오류가 발생했습니다."); }
    private ResponseEntity<?> response(int status, String code, String message) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("code", code, "message", message));
    }
}
