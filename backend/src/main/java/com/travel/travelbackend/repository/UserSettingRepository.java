package com.travel.travelbackend.repository;
import com.travel.travelbackend.entity.UserSetting;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserSettingRepository extends JpaRepository<UserSetting, Long> {}
