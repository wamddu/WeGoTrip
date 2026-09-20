package com.travel.travelbackend.repository;
import com.travel.travelbackend.entity.UserDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface UserDeviceRepository extends JpaRepository<UserDevice, Long> {
    Optional<UserDevice> findByFcmToken(String token);
    Optional<UserDevice> findByIdAndUserId(Long id, Long userId);
    void deleteByUserId(Long userId);
}
